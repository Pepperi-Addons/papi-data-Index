#!/usr/bin/env node

const { Command } = require('commander');
const fs = require('fs');
const packageJson = require('./package.json');
const fetch = require('node-fetch');
const cwd = process.cwd();
const path = require('path');
const uuid = require('uuid').v4;

console.log('cwd', cwd);

async function createAddon(baseURL, body) {
    const url = baseURL + '/var/sk/addons/upsert'

    const options = {
        method: 'POST',
        body: JSON.stringify(body)
    };

    console.log("calling", url);
    const res = await fetch(url, options);
    const json = await res.json();
    console.log('API response', json);
}

async function writeFile(data, path) {
    return new Promise((resolve, reject) => {
        fs.writeFile(path, data, (err) => {
            if (err) {
                console.error(err);
                reject(err);
            }
            else {
                resolve();
            }
        })
    })
}


async function run(options) {
    try {
        const configPath = path.join(cwd, 'addon.config.json');
        const config = require(configPath);
        if (!config) {
            throw new Error('Error reading config file');
        }
        
        const secretPath = path.join(cwd, 'var_sk');
        const secretKey = uuid();

        const addon = {
            UUID: options.uuid,
            Name: options.name,
            Description: options.description,
            SystemData: "{ \"AngularPlugin\":true, \"EditorName\":\"editor\"  }",
            Hidden: false,
            SecretKey: secretKey
        };
        
        await Promise.all([
            createAddon('https://papi.staging.pepperi.com/v1.0', addon),
            createAddon('https://papi.pepperi.com/v1.0', addon),
        ]);

        config.AddonUUID = options.uuid;
        
        const appConfigPath = path.join(cwd, 'client-side/src/app/app.config.ts');
        const appConfig = fs.readFileSync(appConfigPath);
        if (appConfig) {
            const newContent = appConfig.toString().replace('[ADDON_UUID]', options.uuid);
            await writeFile(newContent, appConfigPath);
        } 

        await Promise.all([
            writeFile(JSON.stringify(config, null, 2), configPath),
            writeFile(secretKey, secretPath)
        ]);
    }
    catch (err) {
        console.error(err);
        console.log('run with --help to get help.')
        process.exit(-1);
    }
}

const program = new Command(packageJson.name)
    .version(packageJson.version)
    .description('A script for publishing the Pepperi addon to the var API')
    .option(
        '-n, --addon-name',
        'The addon name. By default uses the current dir name.'
    )
    .option(
        '-d, --addon-description',
        'The addon description. Empty by default.'
    )
    .option(
        '-u, --addon-uuid',
        'Use you own custom uuid from the Addon. By default, we generate one for you'
    )


program.parse(process.argv);

run({
    name: program['addonName'] || path.basename(cwd),
    uuid: program['addonUuid'] || uuid(),
    description: program['addonDescription'] || ''
});