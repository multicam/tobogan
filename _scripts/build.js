
const fs = require('fs'), path = require('path'), yaml = require('node-yaml'), promise = require('bluebird'), {} = require('lodash')
const log = console.log, logt = console.table, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

const loadYaml = async nameInput => {
	const filename = fs.existsSync(nameInput+'.yaml') ? nameInput+'.yaml' : path.join( nameInput, 'index.yaml' )
	log('|>', filename)
	return await yaml.read(filename) || {}
}

const parse = async location => {

	let root = await loadYaml(location)

	// log('-- a', root.pages)

	if( root.pages && root.pages.length ) {

		for(let i in root.pages ) {
			let page = root.pages[i]

			if( page.path ) {
				page = {...page, ...await parse(path.join(location,page.path))}
				log('-- b',page)
			}

			if( page.pages && page.pages.length ) {

				for( j in page.pages ) {
					let p = page.pages[j]

					if( p.path ) {
						p = {...p,...await parse(path.join(location,p.path))}
						delete p.path
						log('-- c',p)

						root.pages.push(p)
					}
				}

				delete page.pages
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
