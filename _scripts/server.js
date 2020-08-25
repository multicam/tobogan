const express = require('express'), body_parser = require('body-parser'), response_time = require('response-time'),cors = require('cors'), fs = require('fs'), path = require('path'), yaml = require('node-yaml')
const {dateFormated,isDirExists} = require('./utils')
const log = console.log, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

const config = require('../package.json').content

log(config)
let app = express();

app.use(body_parser.json());
app.use(body_parser.raw({ type: () => true }));
app.use(response_time())

app.use(
	cors({
		exposedHeaders: [
			'x-auth-token',
			'x-response-time'
		],
	})
)

app.use( (req,res,next) => {
	let ip = (req.headers['x-forwarded-for'] || req.connection.remoteAddress || '').split(',')[0].trim().toUpperCase()
	let agent = req.headers['user-agent']
	log('|>', dateFormated(), ip, agent, req.method, req.url, res.statusCode)
	next()
})


const findFile = name => {
	return isDirExists(name) ?
		fs.existsSync(path.join(config.location,name,'index.yaml')) ?
			path.join(config.location,name,'index.yaml') : null :
			fs.existsSync(path.join(config.location,name)+'.yaml') ?
				path.join(config.location,name)+'.yaml' : null
}

const loadFile = async filename => {
	return await yaml.read(filename)
}

app.get('/*', async (req,res) => {
	let file = findFile(req.url), data = file && await loadFile(file)
	if( data ) res.json(data)
	else res.send('-- empty --')
})

app.listen( 3009, () => {
	log('|>', dateFormated(), 'Listening on port 3009')
})

