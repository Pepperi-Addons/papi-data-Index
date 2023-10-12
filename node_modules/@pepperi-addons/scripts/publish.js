#!/usr/bin/env node

const { Command } = require('commander');
const fs = require('fs');
const packageJson = require('./package.json');
const semver = require('semver');
const fetch = require('node-fetch');
const cwd = process.cwd();
const path = require('path');

console.log('cwd', cwd);

async function getSecret() {
    return new Promise ((resolve, reject) => {
        const secretFile = path.join(cwd, 'var_sk');
        if (fs.exists(secretFile, exist => {
            if (!exist) {
                reject(new Error(`Missing var_sk file in current directory`));
            }
            else {
                fs.readFile(secretFile, (err, data) => {
                    if (err) {
                        reject(new Error(`Error reading var_sk file: ${er}`));
                    }
                    else if (!data) {
                        reject(new Error('Secret is empty. Are you sure you have it?'));
                    }
                    else {
                        resolve(data.toString());
                    }
                })
            }
        }));
    });
}

async function bumpVersion(config, configPath, versionType) {
    return new Promise((resolve, reject) => {
        if (semver.valid(config.AddonVersion)) {
            const bumpedVersion = semver.inc(config.AddonVersion, versionType);
            console.log(`Bumping addon version from ${config.AddonVersion} to ${bumpedVersion}`)
            config.AddonVersion = bumpedVersion;

            // save the config to file with the new version
            fs.writeFile(configPath, JSON.stringify(config, null, 2), (err) => {
                if (err) {
                    console.log('error saving new version to file');
                    console.error(err);
                }
                resolve(config);
            })
        }
        else {
            reject(new Error(config.AddonVersion) + ' isn\'t a valid version. See https://semver.org/.');
        }
    })
}

function getFile(name, path) {
    return {
        FileName: name,
        URL: '',
        Base64Content: fs.readFileSync(path, { encoding: 'base64' })
    };
}

function getFiles(config) {
    const res = [];

    if (config.Endpoints && config.Endpoints.length) {
        config.Endpoints.forEach(endpoint => {

            // replace ts with js
            const file = path.parse(endpoint).name + '.js'
            const filePath = path.join(cwd ,'publish', 'api', file);
            if (fs.existsSync(filePath)) {
                res.push(getFile(file, filePath));
            }
            else {
                console.log(`Skipping API file ${endpoint} - couldn't be found at path ${filePath}`);
            }
        });
    }

    if (config.Editors && config.Editors.length) {
        config.Editors.forEach(editor => {
            // replace ts with js
            let file;
            if (config.PublishConfig && config.PublishConfig.ClientStack && config.PublishConfig.ClientStack === 'ng10'){
                file = editor + '.js';
            }
            else {
                file = editor + '.plugin.bundle.js';
            }
            const filePath = path.join(cwd,'publish','editors', file);
            if (fs.existsSync(filePath)) {
                res.push(getFile(file, filePath));
            }
            else {
                console.log(`Skipping Editor file ${editor} - couldn't be found at path ${filePath}`);
            }
        });
    }

    if (config.Assets && config.Assets.length) {
        config.Assets.forEach(asset => {
            const file = path.join(cwd, 'publish', 'assets', asset);
            if (fs.existsSync(file)) {
                res.push(getFile(asset, file));
            }
            else {
                console.log(`Skipping Editor file ${asset} - couldn't be found at path ${file}`);
            }
        });
    }

    return res;
}

async function addVersion(baseURL, data, secret) {
    const options = {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
            'xx-pepperi-addon-secret-key': secret
        }
    };

    const url = baseURL + '/var/sk/addons/versions';
    console.log("calling", url);
    const res = await fetch(url, options);

    if (!res.ok) {
        throw new Error(`${url} returned status: ${res.status} - ${res.statusText} error: ${await res.text()}`);
    }

    const json = await res.json();
    console.log('API response', json);
}

async function run(secret, bump, configFile, versionDescription, versionType) {
    try {
        console.log("version type is:", versionType);
        if(versionType != 'patch' && versionType != 'minor' && versionType != 'major') {
            throw new Error('version type should be one of the options \'major/minor/patch\' only');
        }

        if (configFile === undefined) {
            configFile = 'addon.config.json'
        }

        const configPath = path.join(cwd, configFile);
        const config = require(configPath);
        if (!config) {
            throw new Error('Error reading config file');
        }

        if (secret === undefined) {
            secret = await getSecret()
        }

        if (bump) {
            await bumpVersion(config, configPath, versionType);
        }

        const files = getFiles(config);
        console.log('files.length', files.length);

        const version = {
            Hidden: false,
            Version: config.AddonVersion,
            Description: versionDescription,
            Available: true,
            Phased: false,
            AddonUUID: config.AddonUUID,
            Files: files,
            PublishConfig: config.PublishConfig ? JSON.stringify(config.PublishConfig): '{}'
        };

        await Promise.all([
            addVersion('https://papi.pepperi.com/v1.0', version, secret),
            addVersion('https://papi.staging.pepperi.com/v1.0', version, secret),
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
        '-sk, --secret-key <secret>', 
        'The secret key for publishing the addon. By default, looks for file ./var_sk`'
    )
    .option(
        '--bump-version',
        'Bump the version number (eg. 1.0.3 -> 1.0.4). Only works if the version is a valid ver-sem. true by default.'
    )
    .option(
        '--no-bump-version',
        'Do not bump the version'
    )
    .option(
        '-c, --config <config>',
        'The addon config json file relative to the current working directory. By default looks for addon.local.config.json'
    )
    .option(
        '--version-type <versionType>',
        'change the version type. can be one of the value \'major\'/\'minor\'/\'patch\'. default value is \'patch\'',
        'patch'
    )
    .option(
        '-d, --desc <desc>',
        'The version description. Empty by default.'
    )


program.parse(process.argv);

run(program['secretKey'], program['bumpVersion'] === undefined || program['bumpVersion'] === true, program.config, program.desc || '', program['versionType']);
