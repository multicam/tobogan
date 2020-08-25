const fs = require('fs')

exports.dateFormated = () => {
	const padStart = num => String(num).padStart(2, '0')

	let now = new Date()
	let year = now.getFullYear(), month = padStart(now.getMonth() + 1), day = padStart(now.getDay()), hour = padStart(now.getHours()), minute = padStart(now.getMinutes()), second = padStart(now.getSeconds())

	return `[${year}-${month}-${day} ${hour}:${minute}:${second}]`
}

exports.isDirExists = dirPath => fs.existsSync(dirPath) && fs.lstatSync(dirPath).isDirectory()
