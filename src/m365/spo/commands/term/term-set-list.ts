import { Logger } from '../../../../cli/Logger';
import config from '../../../../config';
import GlobalOptions from '../../../../GlobalOptions';
import request from '../../../../request';
import { formatting } from '../../../../utils/formatting';
import { ClientSvcResponse, ClientSvcResponseContents, ContextInfo, spo } from '../../../../utils/spo';
import { validation } from '../../../../utils/validation';
import SpoCommand from '../../../base/SpoCommand';
import commands from '../../commands';
import { TermSetCollection } from './TermSetCollection';

interface CommandArgs {
  options: Options;
}

interface Options extends GlobalOptions {
  webUrl?: string;
  termGroupId?: string;
  termGroupName?: string;
}

class SpoTermSetListCommand extends SpoCommand {
  public get name(): string {
    return commands.TERM_SET_LIST;
  }

  public get description(): string {
    return 'Lists taxonomy term sets from the given term group';
  }

  constructor() {
    super();

    this.#initTelemetry();
    this.#initOptions();
    this.#initValidators();
    this.#initOptionSets();
  }

  #initTelemetry(): void {
    this.telemetry.push((args: CommandArgs) => {
      Object.assign(this.telemetryProperties, {
        webUrl: typeof args.options.webUrl !== 'undefined',
        termGroupId: typeof args.options.termGroupId !== 'undefined',
        termGroupName: typeof args.options.termGroupName !== 'undefined'
      });
    });
  }

  #initOptions(): void {
    this.options.unshift(
      {
        option: '-u, --webUrl [webUrl]'
      },
      {
        option: '--termGroupId [termGroupId]'
      },
      {
        option: '--termGroupName [termGroupName]'
      }
    );
  }

  #initValidators(): void {
    this.validators.push(
      async (args: CommandArgs) => {
        if (args.options.webUrl) {
          const isValidSharePointUrl: boolean | string = validation.isValidSharePointUrl(args.options.webUrl);
          if (isValidSharePointUrl !== true) {
            return isValidSharePointUrl;
          }
        }

        if (args.options.termGroupId) {
          if (!validation.isValidGuid(args.options.termGroupId)) {
            return `${args.options.termGroupId} is not a valid GUID`;
          }
        }

        return true;
      }
    );
  }

  #initOptionSets(): void {
    this.optionSets.push({ options: ['termGroupId', 'termGroupName'] });
  }

  public defaultProperties(): string[] | undefined {
    return ['Id', 'Name'];
  }

  public async commandAction(logger: Logger, args: CommandArgs): Promise<void> {
    try {
      const spoWebUrl: string = args.options.webUrl ? args.options.webUrl : await spo.getSpoAdminUrl(logger, this.debug);
      const res: ContextInfo = await spo.getRequestDigest(spoWebUrl);
      if (this.verbose) {
        logger.logToStderr(`Retrieving taxonomy term sets...`);
      }

      const query: string = args.options.termGroupId ? `<Method Id="62" ParentId="60" Name="GetById"><Parameters><Parameter Type="Guid">{${args.options.termGroupId}}</Parameter></Parameters></Method>` : `<Method Id="62" ParentId="60" Name="GetByName"><Parameters><Parameter Type="String">${formatting.escapeXml(args.options.termGroupName)}</Parameter></Parameters></Method>`;

      const requestOptions: any = {
        url: `${spoWebUrl}/_vti_bin/client.svc/ProcessQuery`,
        headers: {
          'X-RequestDigest': res.FormDigestValue
        },
        data: `<Request AddExpandoFieldTypeSuffix="true" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="${config.applicationName}" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="55" ObjectPathId="54" /><ObjectIdentityQuery Id="56" ObjectPathId="54" /><ObjectPath Id="58" ObjectPathId="57" /><ObjectIdentityQuery Id="59" ObjectPathId="57" /><ObjectPath Id="61" ObjectPathId="60" /><ObjectPath Id="63" ObjectPathId="62" /><ObjectIdentityQuery Id="64" ObjectPathId="62" /><ObjectPath Id="66" ObjectPathId="65" /><Query Id="67" ObjectPathId="65"><Query SelectAllProperties="false"><Properties /></Query><ChildItemQuery SelectAllProperties="true"><Properties><Property Name="Name" ScalarProperty="true" /><Property Name="Id" ScalarProperty="true" /></Properties></ChildItemQuery></Query></Actions><ObjectPaths><StaticMethod Id="54" Name="GetTaxonomySession" TypeId="{981cbc68-9edc-4f8d-872f-71146fcbb84f}" /><Method Id="57" ParentId="54" Name="GetDefaultSiteCollectionTermStore" /><Property Id="60" ParentId="57" Name="Groups" />${query}<Property Id="65" ParentId="62" Name="TermSets" /></ObjectPaths></Request>`
      };

      const processQuery: string = await request.post(requestOptions);
      const json: ClientSvcResponse = JSON.parse(processQuery);
      const response: ClientSvcResponseContents = json[0];
      if (response.ErrorInfo) {
        throw response.ErrorInfo.ErrorMessage;
      }

      const result: TermSetCollection = json[json.length - 1];
      if (result._Child_Items_ && result._Child_Items_.length > 0) {
        result._Child_Items_.map(t => {
          t.CreatedDate = new Date(Number(t.CreatedDate.replace('/Date(', '').replace(')/', ''))).toISOString();
          t.Id = t.Id.replace('/Guid(', '').replace(')/', '');
          t.LastModifiedDate = new Date(Number(t.LastModifiedDate.replace('/Date(', '').replace(')/', ''))).toISOString();
          return t;
        });

        logger.log(result._Child_Items_);
      }
    }
    catch (err: any) {
      this.handleRejectedODataJsonPromise(err);
    }
  }
}

module.exports = new SpoTermSetListCommand();