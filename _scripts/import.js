const dropbox_exports = '/media/ssd1/dropbox/TGDS Dropbox/TGDS - Web 2020/__Exports/svg', dest_dir = '/media/ssd1/dropbox/TGDS Dropbox/TGDS - Web 2020/__Exports/markdown'
const chalk = require('chalk'), fs = require('fs'), path = require('path'), {parse} = require('svg-parser')
const log = console.log, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

const walk_svg = (res,svg) => {

	if( svg.properties && svg.properties['data-name']) {
		// log(svg)
		res.push(svg.properties['data-name'])
	}

	if( svg.children && svg.children.length ) {
		for(let i in svg.children) {
			walk_svg(res,svg.children[i])
		}
	}

}

const cleanup_results = res => res.filter( i =>
		i.indexOf('IMAGE') !== 0 &&
		i.indexOf('Group') !== 0 &&
		i.indexOf('Path') !== 0 &&
		i.indexOf('Line') !== 0 &&
		i.indexOf('Rectangle') !== 0
)

const import_svg_xd = async dir_path => {
	log(chalk.green('doing', dir_path))
	const files = await fs.promises.readdir( dir_path );
	for( const file of files ) {
		log('doing', file)
		const svgText = await fs.promises.readFile(path.join(dir_path, file),'utf8')
		const svg = parse(svgText)
		let res = []
		walk_svg(res,svg)
		res = cleanup_results(res)
		const resText = res.join('\n\n')
		await fs.promises.writeFile( path.join( dest_dir, path.basename(file,'.svg')+'.md'),resText,'utf8')
	}
}

(async () => import_svg_xd(dropbox_exports))();

