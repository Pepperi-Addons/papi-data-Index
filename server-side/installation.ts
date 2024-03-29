
/*
The return object format MUST contain the field 'success':
{success:true}

If the result of your code is 'false' then return:
{success:false, erroeMessage:{the reason why it is false}}
The error Message is importent! it will be written in the audit log and help the user to understand what happen
*/

import { Client, Request } from '@pepperi-addons/debug-server'
import { AddonDataScheme, PapiClient, Subscription} from '@pepperi-addons/papi-sdk'
import {delete_index} from './data_index_ui_api'
import {all_activities_schema} from './data_index_meta_data'
import jwtDecode from 'jwt-decode';
import { CommonMethods } from './CommonMethods';
import MyService from './my.service';
import semver from 'semver';
import { promises } from 'dns';

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
            AccountFieldID:"UUID", 
            IndexedAccountFieldID:`${prefix}Account.UUID`,
            UserFieldID:"UUID", 
            IndexedUserFieldID:`${prefix}Agent.UUID`
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
    const papiClient = CommonMethods.getPapiClient(client)
    if (request.body.FromVersion && semver.compare(request.body.FromVersion, '0.5.30') < 0) 
	{
        throw new Error("Upgrade is not supported, please uninstall and reinstall the addon");
	}
    if (request.body.FromVersion && semver.compare(request.body.FromVersion, '1.0.0') < 0)
    {
        await subscribeToDataQueryRelation(client);
    }
    if(request.body.FromVersion && semver.compare(request.body.FromVersion, '1.1.10') < 0)
    {
        result = await deleteAndRecreateTheIndex(client,request);
    }
    if(request.body.FromVersion && semver.compare(request.body.FromVersion, '1.1.12') < 0)
    {
        let subsriptions: Subscription[] = await papiClient.notification.subscriptions.find({where:"Name in ('all_activities_pns_hidden_update','all_activities_pns_insert','all_activities_pns_update')"});
        for( let subsription of subsriptions)
        {
            subsription.FilterPolicy.Resource = [
                "activities",
                "transactions"
            ]
            await papiClient.notification.subscriptions.upsert(subsription);
        }
    }
    if(request.body.FromVersion && semver.compare(request.body.FromVersion, '1.2.27') < 0) 
    {
        // we must add it to shared index schema - so it will be indexed on the elastic (these happen when publishing from the Ui)
        //also need to add it to the data_index_ui - so it will be in that all_activities_fields and transaction_lines_fields 
        await addAgentUUIDToSchemas(papiClient, client);
        
        let resObj  = await papiClient.addons.api.uuid(client.AddonUUID).async().file("data_index").func("full_index_rebuild").post()
        console.log(`full-index_rebuild results: ${JSON.stringify(resObj)}, call 'data_index/full_index_rebuild_polling' to see progress`);
        await subscribeToDataQueryRelation(client);
    }
    return result
}


async function addAgentUUIDToSchemas(papiClient: PapiClient, client: Client): Promise<void> {
    const alSchema = await addAgentUUIDFieldToSchema(papiClient, "all_activities", "Agent.UUID");
    if(alSchema){
        await addAgentUUIDFieldToSchema(papiClient, "transaction_lines", "Transaction.Agent.UUID");
    }

    let uiSchema = await CommonMethods.getDataIndexUIAdalRecord(papiClient, client);
    if (uiSchema["all_activities_fields"] && !uiSchema["all_activities_fields"].find((field) => field == "Agent.UUID")) {
        uiSchema["all_activities_fields"].push("Agent.UUID");

        if (uiSchema["transaction_lines_fields"] && !uiSchema["transaction_lines_fields"].find((field) => field == "Transaction.Agent.UUID")) {
            uiSchema["transaction_lines_fields"].push("Transaction.Agent.UUID");
        }
        await CommonMethods.saveDataIndexUIAdalRecord(papiClient, client, uiSchema);
    }
    
}

async function addAgentUUIDFieldToSchema(papiClient: PapiClient, resouceName: string, agentUUIDField: string) : Promise<AddonDataScheme|null> {
    let schema = await papiClient.addons.data.schemes.name(resouceName).get();

    if(schema?.Fields){ // if no schema or no fields - no need to add the field because they never did export to papi data index
        let fields = schema.Fields ? schema.Fields : {};

        fields[agentUUIDField] = {
            Type: "String",
            Indexed: true,
            Keyword: true
        };
        schema.Fields = fields;
        return await papiClient.addons.data.schemes.post(schema);
    }
    return null;
}

export async function downgrade(client: Client, request: Request): Promise<any> {
    return { success: true, resultObject: {} }
}


async function deleteAndRecreateTheIndex(client: Client,request: Request) {
    let result = { success: true, resultObject: {} };

    try{
        const aa_fields = await all_activities_schema(client,request);//if publish was done once we will get fields from this call
        if(Object.keys(aa_fields).length > 0){
            const service = new MyService(client)
            const aa_shared_index_schema : AddonDataScheme = await service.papiClient.addons.data.schemes.name("all_activities").get();
            const tl_shared_index_schema : AddonDataScheme = await service.papiClient.addons.data.schemes.name("transaction_lines").get();
            
            await delete_index(client,request);
            //create the inner schemes
            await createInnerSchemas(aa_shared_index_schema, service, tl_shared_index_schema);
    
            console.log("Upgrade papi data index - delete the papi data index")
            const publishRes = await service.papiClient.addons.api.uuid(client.AddonUUID).async().file("data_index_ui_api").func("publish_job").post();
            console.log(`Upgrade papi data index - rebuild papi data index - ${JSON.stringify(publishRes)}`)
        }
    }
    catch(err)
    {
        if (err instanceof Error)
        {
            console.error(`Error papi data index upgrade: ${err.message}`);
            result.success=false;
            result["errorMessage"] = err.message;
        } 
        else 
        {
            throw err;
        }
    }
    return result;
}


async function createInnerSchemas(aa_shared_index_schema: AddonDataScheme, service: MyService, tl_shared_index_schema: AddonDataScheme) {
    console.log(`Upgrade papi data index - recreate all activities schema: ${JSON.stringify(aa_shared_index_schema)}`);
    const aa_result = await service.papiClient.addons.data.schemes.post(aa_shared_index_schema);
    console.log(`Upgrade papi data index - recreate all activities result: ${JSON.stringify(aa_result)}`);

    console.log(`Upgrade papi data index - recreate transaction_lines schema: ${JSON.stringify(tl_shared_index_schema)}`);
    const tl_result = service.papiClient.addons.data.schemes.post(tl_shared_index_schema);
    console.log(`Upgrade papi data index - recreate transaction_lines result: ${JSON.stringify(tl_result)}`);
}

