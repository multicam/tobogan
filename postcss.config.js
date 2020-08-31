module.exports = {
	plugins: [
		require('postcss-import'),
		require(`tailwindcss`)(`tailwind.config.js`),

		require('autoprefixer'),
		{
			"autoprefixer": {
				"flexbox": "no-2009"
			},
			"stage": 3,
			"features": {
				"custom-properties": false
			}
		}
	],
};
