import { Client, Request } from '@pepperi-addons/debug-server'
import { CommonMethods } from './CommonMethods';
import jwtDecode from "jwt-decode";
import { PapiClient } from '@pepperi-addons/papi-sdk';

// /////function to remove - I change the interface, need to remove after a few versios
// export async function all_activities_fields(client: Client, request: Request): Promise<any> {
//     return await getDataIndexFields(client, "all_activities");
// }
// /////function to remove - I change the interface, need to remove after a few versios
// export async function transaction_lines_fields(client: Client, request: Request): Promise<any> {
//     return await getDataIndexFields(client, "transaction_lines");
// }

export async function all_activities_schema(client: Client, request: Request): Promise<any> {
    return await getDataIndexSchema(client, "all_activities");
}

export async function transaction_lines_schema(client: Client, request: Request): Promise<any> {
    return await getDataIndexSchema(client, "transaction_lines");
}

interface SchemaFields{
    [key: string]: {Type:string, OptionalValues?:String[]};
    
}

/////function to remove - I change the interface, need to remove after a few versios
// async function getDataIndexFields(client: Client, dataIndexType: string) {
//     var papiClient = CommonMethods.getPapiClient(client);
//     // need to take the fields we saved from the UI and the exported field because 
//     //it can be a case where the build is now immidialty and a code job will do it
//     // so we want to get the fields we save in the last time 
//     var ui_adalRecord = await CommonMethods.getDataIndexUIAdalRecord(papiClient,client);
    
//     var fields = [];
//     if (ui_adalRecord[`${dataIndexType}_fields`]) {
//         fields = ui_adalRecord[`${dataIndexType}_fields`];
//     }

//     return { Fields: fields };
// }

async function getDataIndexSchema(client: Client, dataIndexType: string) {
    var papiClient = CommonMethods.getPapiClient(client);

        var ui_adalRecord = await CommonMethods.getDataIndexUIAdalRecord(papiClient,client);
        var savedFields:string[] = [];
        if (ui_adalRecord[`${dataIndexType}_fields`]) {
        savedFields = ui_adalRecord[`${dataIndexType}_fields`];
        }
    let schemaFields : SchemaFields = await getSchemaFields(papiClient,dataIndexType,savedFields);

    await SaveOptionalValuesFromElastic(client, schemaFields, dataIndexType)

    return { Fields: schemaFields };
}

// function getFieldListFromElasticSearchMapping(mapping,prefix){
//     let fields:{FieldID:string,Type:string}[] = [];
//     for (let property in mapping) {
//         let value = mapping[property];
//         if(value["properties"]){
//             fields = fields.concat(getFieldListFromElasticSearchMapping(value["properties"],`${prefix}${property}.`));
//         }
//         else{
//             fields.push({FieldID:`${prefix}${property}`,Type:value["type"]});
//         }
//     }
//     return fields;
// }



// dataIndexType is "all_activities" or "transaction_lines"
async function getSchemaFields(papiClient: PapiClient, dataIndexType,savedFields):Promise<SchemaFields> {
    let schemaFields: SchemaFields = {};

    const schema = await papiClient.get(`/addons/data/schemes/${dataIndexType}`);
    const fields = schema.Fields;
    for (let fieldID in fields) {
        if(savedFields.includes(fieldID))
            schemaFields[fieldID]= 
            {
                Type: fields[fieldID].Type
            };
    }
    return schemaFields;
}

async function SaveOptionalValuesFromElastic(client:Client, schemaFields : SchemaFields, dataIndexType:string) {
    var papiClient = CommonMethods.getPapiClient(client);

    const multiSelectFields = {
        "all_activities" :["Account.Country","Account.State","Account.StatusName","StatusName","Type"],
        "transaction_lines":["Transaction.Account.Country","Transaction.Account.State","Transaction.Account.StatusName",
                             "Transaction.StatusName","Transaction.Type","Item.MainCategory"]
    }

    for(var fieldID in schemaFields) {
        if(multiSelectFields[dataIndexType].includes(fieldID)){
            schemaFields[fieldID].Type = "MultipleStringValues";
            let body = {
                "size":"0",
                "aggs" : {
                    "distinct_values" : {
                        "terms" : { 
                            "field" : fieldID,
                            "size" : "1000"
                        }
                    }
                }
            }
            const res = await papiClient.post(`/addons/shared_index/index/papi_data_index/search/${client.AddonUUID}/${dataIndexType}`,body);
            const distinct_values = res["aggregations"]["distinct_values"]["buckets"].map(x => x.key);
            
            schemaFields[fieldID]["OptionalValues"] = distinct_values;
        }
    }
}
