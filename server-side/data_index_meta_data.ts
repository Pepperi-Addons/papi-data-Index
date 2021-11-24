import { Client, Request } from '@pepperi-addons/debug-server'
import { CommonMethods } from './CommonMethods';

export async function all_activities_fields(client: Client, request: Request): Promise<any> {
    return await getDataIndexFieldsByType(client, "all_activities");
}

export async function transaction_lines_fields(client: Client, request: Request): Promise<any> {
    return await getDataIndexFieldsByType(client, "transaction_lines");
}

export async function fields(client: Client, request: Request): Promise<any> {
    return await getDataIndexFields(client);
}

async function getDataIndexFields(client: Client) {
    var papiClient = CommonMethods.getPapiClient(client);
    // need to take the fields we saved from the UI and not the exported field because 
    // it can be a case where the build is now immidialty and a code job will do it
    // so we want to get the fields we save in the last time 
    var ui_adalRecord = await CommonMethods.getDataIndexUIAdalRecord(papiClient,client);
    
    return ui_adalRecord["Fields"]? ui_adalRecord["Fields"] : {};

}

async function getDataIndexFieldsByType(client: Client, dataIndexType: string) {

    var fields = await getDataIndexFields(client); // all types fields

    return { Fields: fields[dataIndexType] ? fields[dataIndexType] : [] };
}
