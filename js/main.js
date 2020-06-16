import './_grid'
import gsap from 'gsap'
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

const log = console.log, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

ScrollTrigger.defaults({
  toggleActions: "restart pause resume pause"
});
const timeline = gsap.timeline();
timeline
  .to(".box", {
    duration: .5,
    width: '110%',
    ease: "expo"
  })
  .to(".box", {
    duration: 1.25,
    width: '0',
    ease: "expo"
  })

//   .to(".box", { duration: 1, backgroundColor: "#f38630" }, "+=0.5")
//   .to(".box", { duration: 1, x: 0, rotation: -360 }, "+=0.5")

const myScrollTrigger = {
  trigger: ".slide",
  scrub: true
}

const topLine = document.querySelector('.slide .s1')
const botLine = document.querySelector('.slide .s3')

log( 's1', topLine.parentNode.clientWidth, topLine.clientWidth)

gsap.to(".slide .s1", {
  duration: 1,
  translateX: '-50%',
  scrollTrigger: {
    trigger: ".slide",
    scrub: true,
    onEnter: self => {
      log('s1',self)
    }
  }
})

gsap.to(".slide .s3", {
  duration: 1,
  translateX: '50%',
  scrollTrigger: {
    trigger: ".slide",
    scrub: true,
    onEnter: self => {
      log('s2',self)
    }
  }
})

