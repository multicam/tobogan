
const fs = require('fs'), path = require('path'), yaml = require('node-yaml'), promise = require('bluebird'), {} = require('lodash')
const log = console.log, logt = console.table, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

const loadYaml = async (dir,leaf) => {
	const filename = path.join( dir, leaf ? leaf : 'index.yaml' )
	log('|>', filename)
	return fs.existsSync(filename) ? await yaml.read(filename) : await yaml.read(filename+'.yaml') || {}
}

const pagesIndex = {}

const parse = async location => {

	log('parsing', location)

	let root = await loadYaml(location)

	log('-- a', root.pages)

	if( root.pages && root.pages.length ) {
		for(let i in root.pages ) {
			let page = root.pages[i]
			if( page.path ) {
				log('++',page.path)
				page = {...page, ...await parse(page.path)}
			}
		}
	}

	return root
}

const run_on_flat = (fn, exit = false) =>
	promise.coroutine( function *() { yield fn() })().then( () => exit && process.exit() );

run_on_flat(async () => {

	const config = require('../package.json').content
	const data = await parse(config.location)
	log("|>",serialize(data,null,2))

})


// // Serves all the request which includes /images in the url from Images folder
// // app.use('/courses', express.static(courses_dir));
// let server = app.listen(5009);
