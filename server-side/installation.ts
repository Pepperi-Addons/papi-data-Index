
/*
The return object format MUST contain the field 'success':
{success:true}

If the result of your code is 'false' then return:
{success:false, erroeMessage:{the reason why it is false}}
The error Message is importent! it will be written in the audit log and help the user to understand what happen
*/

import { Client, Request } from '@pepperi-addons/debug-server'
import { AddonDataScheme, PapiClient} from '@pepperi-addons/papi-sdk'
import jwtDecode from 'jwt-decode';
import { CommonMethods } from './CommonMethods';
import MyService from './my.service';
import semver from 'semver';

export async function install(client: Client, request: Request): Promise<any> {

    var resultObject: { [k: string]: any } = {};
    resultObject.success = true;
    resultObject.resultObject = {};
    try {
        var papiClient = new PapiClient({
            baseURL: client.BaseURL,
            token: client.OAuthAccessToken,
            addonUUID: client.AddonUUID,
            addonSecretKey: client.AddonSecretKey
        });
        //Create the relevant meta data in the papi-adal
        var res = await papiClient.post("/bulk/data_index/rebuild/install");

        //Create the relevant initial meta data in the data_index addon adal
        await createInitialDataIndexTableAdalSchemaAndData(papiClient, client);
        await createInitialDataIndexUISchema(papiClient, client);
        await CommonMethods.createIndex(papiClient, client);
        await setUsageMonitorRelation(client);
        await subscribeToDataQueryRelation(client);
    }
    catch (e) {
        resultObject.success = false;
        resultObject.errorMessage = e.message;
    }
    return resultObject
}

async function subscribeToDataQueryRelation(client: Client) {
    await setDataQueriesRelation(client, "all_activities");
    await setDataQueriesRelation(client, "transaction_lines", "Transaction");
}

async function setUsageMonitorRelation(client){
    try {

        const usageMonitorRelation = {
            RelationName: "UsageMonitor",
            Name: "Papi Data Index and queries usage data", 
            Description: "Papi Data Index and queries usage data", 
            Type: "AddonAPI",
            AddonUUID: client.AddonUUID,
            AddonRelativeURL: 'monitor/usage_data'
        };
       
        const service = new MyService(client);
        var res =  await service.upsertRelation(usageMonitorRelation);

        return { success:true, resultObject: null };
    } catch(err) {
        return { success: false, resultObject: err };
    }
}

async function setDataQueriesRelation(client: Client,resource:string, prefix?:string){
    try {
        prefix = prefix? `${prefix}.`: "";

        const usageMonitorRelation = {
            RelationName: "DataQueries",
            Name:resource, 
            Description: `${resource} relation data`, 
            Type: "AddonAPI",
            AddonUUID: client.AddonUUID,
            AddonRelativeURL: `/addons/shared_index/index/papi_data_index/search/${client.AddonUUID}/${resource}`,
            SchemaRelativeURL:`/addons/api/${client.AddonUUID}/data_index_meta_data/${resource}_schema`,
            AccountFieldID:"InternalID", 
            IndexedAccountFieldID:`${prefix}Account.InternalID`,
            UserFieldID:"InternalID", 
            IndexedUserFieldID:`${prefix}Agent.InternalID`
        };
       
        const service = new MyService(client);
        var res =  await service.upsertRelation(usageMonitorRelation);

        return { success:true, resultObject: null };
    } catch(err) {
        return { success: false, resultObject: err };
    }
}


async function createInitialDataIndexTableAdalSchemaAndData(papiClient: PapiClient, client: Client) {
    var body: AddonDataScheme = {
        Name: "data_index",
        Type: "data"
    };

    //create data_index-adal schema
    await papiClient.addons.data.schemes.post(body);
    await papiClient.addons.data.uuid(client.AddonUUID).table("data_index").upsert({ Key: 'all_activities' });
    await papiClient.addons.data.uuid(client.AddonUUID).table("data_index").upsert({ Key: 'transaction_lines' });
}

async function createInitialDataIndexUISchema(papiClient: PapiClient, client: Client) {

    //create data_index-adal schema
    await papiClient.addons.data.schemes.post({
        Name: "data_index_ui",
        Type: "meta_data"
    });
    papiClient.addons.data.uuid(client.AddonUUID).table("data_index_ui").upsert({ Key: 'meta_data' });
}


export async function uninstall(client: Client, request: Request): Promise<any> {

    let result = { success: true, resultObject: null };

    try{
        const service = new MyService(client)
        await service.papiClient.post("/bulk/data_index/rebuild/uninstall");
        return result;
    }
    catch(err){
        console.log('Failed to uninstall papi-data-index', err)
        return { success: false ,errorMessage: err };
    }
}

export async function upgrade(client: Client, request: Request): Promise<any> {
    let result = { success: true, resultObject: {} };
    if (request.body.FromVersion && semver.compare(request.body.FromVersion, '0.5.30') < 0) 
	{
        result.success=false;
        result["errorMessage"] = "Upgrade is not supported, please uninstall and reinstall the addon";  
	}else{
        await subscribeToDataQueryRelation(client);
    }
    return { success: true, resultObject: {} }
}

export async function downgrade(client: Client, request: Request): Promise<any> {
    return { success: true, resultObject: {} }
}


