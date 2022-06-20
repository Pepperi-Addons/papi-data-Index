import { Client, Request } from '@pepperi-addons/debug-server'
import jwtDecode from 'jwt-decode';
import MyService from './my.service';


export async function usage_data(client: Client, request: Request) {
    var al_count = await count_aggregation(client,"all_activities");
    var tl_count = await count_aggregation(client,"transaction_lines");


    return {
        "Title": "Data",
        "Resources": [
            {
                "Data": "Data Index All Activities",
                "Description": "Number of Transactions and Activities stored in data index",
                "Size": al_count
            },
            {
                "Data": "Data Index Transaction Lines",
                "Description": "Number of Transaction Lines stored in data index",
                "Size": tl_count
            }
        ]
    }
};



  async function count_aggregation(client: Client,indexType:string){
    const distributorUUID = (<any>jwtDecode(client.OAuthAccessToken))["pepperi.distributoruuid"];

    const service = new MyService(client)
    let endpoint = `${distributorUUID}/_search`;
    const method = 'POST';

    var body = {
        "size": 0,
        "aggs": {
            "uuid_count" : { "value_count" : { "field" : "UUID" } 
            }
        } 
    };

    var res = await service.papiClient.post(`/addons/shared_index/index/papi_data_index/search/${client.AddonUUID}/${indexType}`, body);
    console.log(`Search Response: ${JSON.stringify(res)}`);
    return res["aggregations"]? (res["aggregations"]["uuid_count"] ? res["aggregations"]["uuid_count"]["value"] :0):0;
  }

