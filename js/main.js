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
    delay: .25,
    duration: 1.25,
    width: '0',
    ease: "expo"
  })


const myScrollTrigger = {
  trigger: ".slide",
  scrub: true
}
//
// const topLine = document.querySelector('.slide .s1 h2')
// const botLine = document.querySelector('.slide .s3 h2')
//
// log( 's1', topLine.parentNode.offsetWidth, topLine, topLine.offsetWidth)


gsap.to(".slide .s1", {
  duration: 1,
  translateX: '-50%',
  scrollTrigger: {
    trigger: ".slide",
    scrub: true,
    onEnter: self => {
      // log('s1',self)
    }
  }
})

gsap.to(".slide .s3", {
  duration: 1,
  startAt: {
    translateX: '-100%'
  },
  translateX: '0%',
  scrollTrigger: {
    trigger: ".slide",
    scrub: true,
    onEnter: self => {
      // log('s2',self)
    }
  }
})

