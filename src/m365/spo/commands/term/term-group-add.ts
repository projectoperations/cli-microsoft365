import { v4 } from 'uuid';
import { Logger } from '../../../../cli/Logger';
import config from '../../../../config';
import GlobalOptions from '../../../../GlobalOptions';
import request, { CliRequestOptions } from '../../../../request';
import { formatting } from '../../../../utils/formatting';
import { ClientSvcResponse, ClientSvcResponseContents, ContextInfo, spo } from '../../../../utils/spo';
import { validation } from '../../../../utils/validation';
import SpoCommand from '../../../base/SpoCommand';
import commands from '../../commands';
import { TermGroup } from './TermGroup';
import { TermStore } from './TermStore';

interface CommandArgs {
  options: Options;
}

interface Options extends GlobalOptions {
  description?: string;
  id?: string;
  name: string;
  webUrl?: string;
}

class SpoTermGroupAddCommand extends SpoCommand {
  public get name(): string {
    return commands.TERM_GROUP_ADD;
  }

  public get description(): string {
    return 'Adds taxonomy term group';
  }

  constructor() {
    super();

    this.#initTelemetry();
    this.#initOptions();
    this.#initValidators();
  }

  #initTelemetry(): void {
    this.telemetry.push((args: CommandArgs) => {
      Object.assign(this.telemetryProperties, {
        description: typeof args.options.id !== 'undefined',
        id: typeof args.options.id !== 'undefined',
        webUrl: typeof args.options.webUrl !== 'undefined'
      });
    });
  }

  #initOptions(): void {
    this.options.unshift(
      {
        option: '-n, --name <name>'
      },
      {
        option: '-i, --id [id]'
      },
      {
        option: '-d, --description [description]'
      },
      {
        option: '-u, --webUrl [webUrl]'
      }
    );
  }

  #initValidators(): void {
    this.validators.push(
      async (args: CommandArgs) => {
        if (args.options.id && !validation.isValidGuid(args.options.id)) {
          return `${args.options.id} is not a valid GUID`;
        }

        if (args.options.webUrl) {
          return validation.isValidSharePointUrl(args.options.webUrl);
        }

        return true;
      }
    );
  }

  public async commandAction(logger: Logger, args: CommandArgs): Promise<void> {
    let formDigest: string = '';
    let termGroup: TermGroup;

    try {
      const webUrl: string = args.options.webUrl || await spo.getSpoAdminUrl(logger, this.debug);
      const res: ContextInfo = await spo.getRequestDigest(webUrl);
      formDigest = res.FormDigestValue;

      if (this.verbose) {
        logger.logToStderr(`Getting taxonomy term store...`);
      }

      const requestOptionsPost: CliRequestOptions = {
        url: `${webUrl}/_vti_bin/client.svc/ProcessQuery`,
        headers: {
          'X-RequestDigest': res.FormDigestValue
        },
        data: `<Request AddExpandoFieldTypeSuffix="true" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="${config.applicationName}" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="4" ObjectPathId="3" /><ObjectIdentityQuery Id="5" ObjectPathId="3" /><ObjectPath Id="7" ObjectPathId="6" /><ObjectIdentityQuery Id="8" ObjectPathId="6" /><Query Id="9" ObjectPathId="6"><Query SelectAllProperties="true"><Properties /></Query></Query></Actions><ObjectPaths><StaticMethod Id="3" Name="GetTaxonomySession" TypeId="{981cbc68-9edc-4f8d-872f-71146fcbb84f}" /><Method Id="6" ParentId="3" Name="GetDefaultSiteCollectionTermStore" /></ObjectPaths></Request>`
      };

      const processQuery: string = await request.post(requestOptionsPost);
      const json: ClientSvcResponse = JSON.parse(processQuery);
      const response: ClientSvcResponseContents = json[0];
      if (response.ErrorInfo) {
        throw response.ErrorInfo.ErrorMessage;
      }

      const termStore: TermStore = json[json.length - 1];
      const termGroupId: string = args.options.id || v4();

      if (this.verbose) {
        logger.logToStderr(`Adding taxonomy term group...`);
      }

      const requestOptions: CliRequestOptions = {
        url: `${webUrl}/_vti_bin/client.svc/ProcessQuery`,
        headers: {
          'X-RequestDigest': formDigest
        },
        data: `<Request AddExpandoFieldTypeSuffix="true" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="${config.applicationName}" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="14" ObjectPathId="13" /><ObjectIdentityQuery Id="15" ObjectPathId="13" /><Query Id="16" ObjectPathId="13"><Query SelectAllProperties="false"><Properties><Property Name="Name" ScalarProperty="true" /><Property Name="Id" ScalarProperty="true" /><Property Name="Description" ScalarProperty="true" /></Properties></Query></Query></Actions><ObjectPaths><Method Id="13" ParentId="6" Name="CreateGroup"><Parameters><Parameter Type="String">${formatting.escapeXml(args.options.name)}</Parameter><Parameter Type="Guid">{${termGroupId}}</Parameter></Parameters></Method><Identity Id="6" Name="${termStore._ObjectIdentity_}" /></ObjectPaths></Request>`
      };

      const terms: string = await request.post(requestOptions);
      const json2: ClientSvcResponse = JSON.parse(terms);
      const response2: ClientSvcResponseContents = json2[0];
      if (response2.ErrorInfo) {
        throw response2.ErrorInfo.ErrorMessage;
      }

      termGroup = json2[json2.length - 1];

      let termGroups: string = undefined as any;
      if (args.options.description) {
        if (this.verbose) {
          logger.logToStderr(`Setting taxonomy term group description...`);
        }

        const requestOptionsQuery: CliRequestOptions = {
          url: `${webUrl}/_vti_bin/client.svc/ProcessQuery`,
          headers: {
            'X-RequestDigest': formDigest
          },
          data: `<Request AddExpandoFieldTypeSuffix="true" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="${config.applicationName}" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><SetProperty Id="51" ObjectPathId="45" Name="Description"><Parameter Type="String">${formatting.escapeXml(args.options.description)}</Parameter></SetProperty></Actions><ObjectPaths><Identity Id="45" Name="${termGroup._ObjectIdentity_}" /></ObjectPaths></Request>`
        };

        termGroups = await request.post(requestOptionsQuery);
      }

      if (termGroups) {
        const json: ClientSvcResponse = JSON.parse(termGroups);
        const response: ClientSvcResponseContents = json[0];
        if (response.ErrorInfo) {
          throw response.ErrorInfo.ErrorMessage;
        }
      }

      delete termGroup._ObjectIdentity_;
      delete termGroup._ObjectType_;
      termGroup.Id = termGroup.Id.replace('/Guid(', '').replace(')/', '');
      termGroup.Description = args.options.description || '';
      logger.log(termGroup);
    }
    catch (err: any) {
      this.handleRejectedODataJsonPromise(err);
    }
  }
}

module.exports = new SpoTermGroupAddCommand();