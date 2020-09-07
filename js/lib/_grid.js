const log = console.log
let canvas, ctx, update = true

function renderGrid () {

  if( update ) {

    canvas = document.getElementById('overlay')
    ctx = canvas.getContext('2d')

    const width = window.innerWidth, height = window.innerHeight, step = window.innerWidth / 100.

    // log('-- grid', width, height)

    canvas.offsetTop = 0;
    canvas.offsetLeft = 0;
    canvas.width = width
    canvas.height = height

    ctx.lineWidth = .5
    ctx.strokeStyle = 'rgba(200,0,0,.25)'

    //
    for( let x=0; x<width; x += step) {
      ctx.beginPath()
      ctx.moveTo(x,0)
      ctx.lineTo(x,height)
      ctx.stroke()
      ctx.closePath()
    }

    update = false;
  }

  requestAnimationFrame(renderGrid)
}

// requestAnimationFrame(renderGrid)

addEventListener("resize",() => {
  update = true
});
