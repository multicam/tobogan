module.exports = function (e11Config) {

  e11Config.addPassthroughCopy('favicon.ico')
  e11Config.addPassthroughCopy('site.webmanifest')
  e11Config.addPassthroughCopy('images');
  e11Config.addPassthroughCopy('img');
  e11Config.addPassthroughCopy('style/*.css');


  // You can return your Config object (optional).
  return {
    templateFormats: [
      'html',
      'md',
      'njk'
    ],
    passthroughFileCopy: true,
  }
}
