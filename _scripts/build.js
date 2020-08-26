
const fs = require('fs'), path = require('path'), yaml = require('node-yaml'), promise = require('bluebird'), chalk = require('chalk')
const log = console.log, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

// -- loadYaml ---------------------------------------------------------------------------------------------------------

const loadYaml = async nameInput => {
	const filename = fs.existsSync(nameInput+'.yaml') ? nameInput+'.yaml' : path.join( nameInput, 'index.yaml' )
	log('|>', filename)
	return await yaml.read(filename) || {}
}

// -- perform_loads ----------------------------------------------------------------------------------------------------

const perform_loads = async obj => {

	const keys = keysOf(obj)

	for(let i in keys) {
		const key = keys[i]

		if( key === 'load' ) {

			const pth = typeof obj[key] === 'object' ? obj[key].path : obj[key]
			const filter = typeof obj[key] === 'object' ? obj[key].filter : null

			log('>>>', obj[key], pth, filter )

			let temp = await loadYaml( path.join(_root_path, pth ))
			if( filter) {
				temp = keysOf(temp).reduce( (r,i) => {
					if( filter.includes(i) ) {
						r[i] = temp[i]
					}
					return r
				},{})
			}

			delete obj[key]
			obj = {...obj, ...temp, loaded: true }
		}
		else if( typeof obj[key] === 'object' && !Array.isArray(obj[key]) ) {
			obj[key] = await perform_loads(obj[key])
		}
		else if( typeof obj[key] === 'object' && Array.isArray(obj[key]) ) {
			for(let i in obj[key] ) {
				obj[key][i] = await perform_loads(obj[key][i])
			}
		}
	}

	return obj
}

// -- parse ------------------------------------------------------------------------------------------------------------

let _root_path
const parse = async location => {

	_root_path = _root_path ? _root_path : location

	let root = await loadYaml(location)

	// recursive_load(root)

	// log('-- a', root.pages)

	if( root.pages && root.pages.length ) {

		for(let i in root.pages ) {
			let page = root.pages[i]

			if( page.path ) {
				page = {...page, ...await parse(path.join(_root_path, page.path))}
				delete page.path
				root.pages[i] = {...page} // * deep
				// log('-- b',page)
			}

			if( page.pages && page.pages.length ) {

				for( j in page.pages ) {
					let p = page.pages[j]

					if( p.path ) {
						p = {...p,...await parse(path.join(_root_path,p.path))}
						delete p.path
						root.pages.push({...p}) // * deep
						// log('-- c',p)
					}
				}

				delete page.pages
			}
		}
	}

	return perform_loads(root)
}

// -- run_on_flat ------------------------------------------------------------------------------------------------------

const run_on_flat = (fn, exit = false) =>
	promise.coroutine( function*() { yield fn() })().then( () => exit && process.exit() );

run_on_flat(async () => {

	const config = require('../package.json').content
	const data = await parse(config.location)
	log("|>",serialize(data,null,2))
	log(data.pages[0])
})

