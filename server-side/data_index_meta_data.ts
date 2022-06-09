import { Client, Request } from '@pepperi-addons/debug-server'
import { CommonMethods } from './CommonMethods';
import jwtDecode from "jwt-decode";
import { PapiClient } from '@pepperi-addons/papi-sdk';

/////function to remove - I change the interface, need to remove after a few versios
export async function all_activities_fields(client: Client, request: Request): Promise<any> {
    return await getDataIndexFields(client, "all_activities");
}
/////function to remove - I change the interface, need to remove after a few versios
export async function transaction_lines_fields(client: Client, request: Request): Promise<any> {
    return await getDataIndexFields(client, "transaction_lines");
}

export async function all_activities_schema(client: Client, request: Request): Promise<any> {
    return await getDataIndexSchema(client, "all_activities");
}

export async function transaction_lines_schema(client: Client, request: Request): Promise<any> {
    return await getDataIndexSchema(client, "transaction_lines");
}

/////function to remove - I change the interface, need to remove after a few versios
async function getDataIndexFields(client: Client, dataIndexType: string) {
    var papiClient = CommonMethods.getPapiClient(client);
    // need to take the fields we saved from the UI and the exported field because 
    //it can be a case where the build is now immidialty and a code job will do it
    // so we want to get the fields we save in the last time 
    var ui_adalRecord = await CommonMethods.getDataIndexUIAdalRecord(papiClient,client);
    
    var fields = [];
    if (ui_adalRecord[`${dataIndexType}_fields`]) {
        fields = ui_adalRecord[`${dataIndexType}_fields`];
    }

    return { Fields: fields };
}

async function getDataIndexSchema(client: Client, dataIndexType: string) {
    var papiClient = CommonMethods.getPapiClient(client);
    
        var schema = await getSchemaFromAdal(papiClient,dataIndexType);

        var ui_adalRecord = await CommonMethods.getDataIndexUIAdalRecord(papiClient,client);
        var savedFields:string[] = [];
        if (ui_adalRecord[`${dataIndexType}_fields`]) {
        savedFields = ui_adalRecord[`${dataIndexType}_fields`];
        }
    
    let fields = schema.filter(f=>savedFields.includes(f.FieldID))

    await SaveOptionalValuesFromElastic(client, fields, dataIndexType)

    return { Fields: fields };
}

function getFieldListFromElasticSearchMapping(mapping,prefix){
    let fields:{FieldID:string,Type:string}[] = [];
    for (let property in mapping) {
        let value = mapping[property];
        if(value["properties"]){
            fields = fields.concat(getFieldListFromElasticSearchMapping(value["properties"],`${prefix}${property}.`));
        }
        else{
            fields.push({FieldID:`${prefix}${property}`,Type:value["type"]});
        }
    }
    return fields;
}

async function getSchemaFromElastic(client,dataIndexType){
    var papiClient = CommonMethods.getPapiClient(client);
    var distributorUUID = jwtDecode(client.OAuthAccessToken)['pepperi.distributoruuid'];

    const response = await papiClient.addons.api.uuid("00000000-0000-0000-0000-00000e1a571c").sync().file("internal").func("get_mapping").post({type:dataIndexType})
//    await callElasticSearchLambda(`${distributorUUID}/_mapping`, "GET", "");

    var index_mapping = {}
        
    if(response[distributorUUID]){
         if(response[distributorUUID]["mappings"]){
             if(response[distributorUUID]["mappings"]["properties"])
            index_mapping = response[distributorUUID]["mappings"]["properties"];
        }
    }

    return getFieldListFromElasticSearchMapping(index_mapping,"");

}

// dataIndexType is "all_activities" or "transaction_lines"
async function getSchemaFromAdal(papiClient: PapiClient, dataIndexType) {
    let schemaFields: {FieldID:string,Type:string}[] = []
    const fieldsFromAdal = (await papiClient.get(`/addons/data/schemes/${dataIndexType}`)).Fields;
    for (let fieldName in fieldsFromAdal) {
        schemaFields.push({FieldID: fieldName, Type: fieldsFromAdal[fieldName].Type})
    }
    return schemaFields;
}

async function SaveOptionalValuesFromElastic(client, fields, dataIndexType) {
    var papiClient = CommonMethods.getPapiClient(client);

    const multiSelectFields = {
        "all_activities" :["Account.Country","Account.State","Account.StatusName","StatusName","Type"],
        "transaction_lines":["Transaction.Account.Country","Transaction.Account.State","Transaction.Account.StatusName",
                             "Transaction.StatusName","Transaction.Type","Item.MainCategory"]
    }

    for(var field of fields) {
        if(multiSelectFields[dataIndexType].includes(field.FieldID)){
            let body = {
                "size":"0",
                "aggs" : {
                    "distinct_values" : {
                        "terms" : { "field" : field.FieldID }
                    }
                }
            }
            const res = await papiClient.post(`/elasticsearch/search/${dataIndexType}`,body);
            const distinct_values = res["aggregations"]["distinct_values"]["buckets"].map(x => x.key);
            field["optionalValues"] = distinct_values;
        }
    }
}
