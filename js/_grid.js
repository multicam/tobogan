const log = console.log
let canvas, ctx, update = true

function renderGrid () {

  if( update ) {

    canvas = document.getElementById('grid')
    ctx = canvas.getContext('2d')
    // const width = canvas.width, height = canvas.height
    const width = window.innerWidth, height = window.innerHeight, step = 16

    log('-- grid', width, height)
    canvas.width = width
    canvas.height = height

    ctx.lineWidth = .5
    ctx.strokeStyle = 'rgba(200,0,0,.15)'

    //
    // for( let x=0; x<width; x += step) {
    //   ctx.beginPath()
    //   ctx.moveTo(x,0)
    //   ctx.lineTo(x,height)
    //   ctx.stroke()
    //   ctx.closePath()
    // }

    ctx.strokeStyle = 'rgba(0,0,200,.5)'

    const
      sidePad =  18,
      gutter = 8,
      colNum = 12,
      colWidth = Math.floor((width - 2*sidePad)/12)

    for( let n=0; n<=colNum; ++n )  {
      let x = sidePad + n*colWidth

      ctx.beginPath()
      ctx.moveTo(x,0)
      ctx.lineTo(x,height)
      ctx.stroke()
      ctx.closePath()

      ctx.beginPath()
      ctx.moveTo(x+gutter,0)
      ctx.lineTo(x+gutter,height)
      ctx.stroke()
      ctx.closePath()

    }


    update = false;
  }
  requestAnimationFrame(renderGrid)
}
requestAnimationFrame(renderGrid)

addEventListener("resize",() => {
  update = true
});
