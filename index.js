const util = require('util'), fs = require('fs'), fetch = require('node-fetch'),
    streamPipeline = util.promisify(require('stream').pipeline), {VK} = require('vk-io'),
    dotenv = require('dotenv').config({ path: './config.env' }),
    ProgressBar = require('progress'), chalk = require('chalk'), vk = new VK({
        token: process.env.VK_TOKEN
    }), path = require('path');
let progress_downloading, progress_parsing;

if(process.argv[2] !== '--file' || !process.argv[3]){
    console.log(chalk.red('Error no input file.'));
    console.log(chalk.blue('Use example: node index.js --file wall.txt'));
    process.exit(0);
}
if(!fs.existsSync(process.argv[3])){
    console.log(chalk.red(`Error input file not exits!`));
    process.exit(0);
}
const checkFile = fs.readFileSync(process.argv[3]).toString();
if(!checkFile.split("\n").length || !checkFile.length){
    console.log(chalk.red(`Error input file is empty!`));
    process.exit(0);
}

const dir = './Downloads';

if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
    console.log(chalk.green(`Downloads directory successfully created`));
}

let records = fs.readFileSync(process.argv[3]).toString().split("\n");

let success_parse = 0, fail_parse = 0;
progress_parsing = new ProgressBar(`${chalk.blue('Parsing')} [:bar] :percent :etas ${chalk.green('Success: :success')} ${chalk.red('Failed (Skipped): :fail')}`, {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: records.length
});
for(let record_index = 0; record_index < records.length; record_index++){
    const record_id = records[record_index].match(/wall-?((?:[0-9]+)_(?:[0-9]+))$/gm);
    if(record_id  && record_id[0]){
        records[record_index] = record_id[0];
        success_parse++;
    } else {
        fail_parse++;
    }

    progress_parsing.tick({
        'fail': fail_parse,
        'success': success_parse,
    });
    const count_buff = records.length;
    records = Array.from(new Set(records.map(item => item.trim())));
    if (progress_parsing.complete) {
        if(count_buff != records.length) console.log(chalk.yellow(`Removed ${count_buff-records.length} duplicates records`));
        console.log(chalk.green(`Successfully parsed ${records.length} records`));
    }
}
progress_downloading = new ProgressBar(`${chalk.green('Downloading')} ${chalk.blue(':wallid')} [${chalk.yellow(':bar')}] ${chalk.bgGray(':rate/bps')} :percent :etas`, {
    complete: '=',
    incomplete: ' ',
    width: 20,
    total: records.length
});

let subarray = [];
const size = 100;
for (let i = 0; i < Math.ceil(records.length/size); i++){
    subarray[i] = records.slice((i*size), (i*size) + size);
}
records = subarray;
console.log(chalk.green(`Successfully sorted records`));

(async () => {
    for(let sub of records){
        let compiled = '';
        for(let id = 0; id < sub.length; id++){
            compiled += sub[id].replace('wall', '')+((id < sub.length-1) ? ',' : '')
        }
        const response = await vk.api.wall.getById({
            posts: compiled
        });

        for(let item = 0; item < response.length; item++){
            let photo = 0;
            progress_downloading.tick({
                'wallid': sub[item]
            });
            if (progress_downloading.complete) {
                console.log(chalk.green('\nSuccessfully downloaded\n'));
            }
            for(let attach of response[item].attachments){
                if(attach.type === 'photo'){
                    const download_dir = path.join(dir, sub[item]);
                    if (!fs.existsSync(download_dir)){
                        fs.mkdirSync(download_dir);
                    }
                    await download(
                        attach.photo.sizes.find(x =>
                            x.type === 'w' ||
                            x.type === 'z' ||
                            x.type === 'y'
                        ).url,
                        path.join(download_dir, photo.toString()+'.jpg')
                    );
                    photo++;
                }
            }
        }
    }
})();

async function download(url, path){
    const response = await fetch(url);
    if (response.ok) {
        return streamPipeline(response.body, fs.createWriteStream(path));
    }
    throw new Error(`Unexpected response ${response.statusText}`);
}