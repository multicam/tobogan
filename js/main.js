import './lib/_grid'
import gsap from 'gsap'
import { ScrollTrigger } from "gsap/ScrollTrigger";

const log = console.log, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

gsap.registerPlugin(ScrollTrigger);

ScrollTrigger.defaults({
	toggleActions: "restart pause resume pause"
});

const timeline = gsap.timeline();
timeline
  .to("#hello .box", {
    delay: .75,
    duration: 2.5,
    translateY: '100%',
    ease: "expo"
  })

gsap.to(".slide_students .s1", {
  duration: 1,
  translateX: '-50%',
  scrollTrigger: {
    trigger: ".slide_students",
    scrub: true
  }
})

gsap.to(".slide_students .s3", {
  duration: 1,
  startAt: {
    translateX: '-100%'
  },
  translateX: '0%',
  scrollTrigger: {
    trigger: ".slide_students",
    scrub: true
  }
})

const infinite = gsap.timeline({repeat:-1,paused: false})

infinite.fromTo('.image .content span', {
    duration: 2.5,
    x:'100%',
  },
  {
    duration: 2.5,
    x:'-100%',
  }
)


const tl2 = gsap.timeline()

tl2.from(".slide_courses .s1",{
  rotateZ: '90deg',
  translateY: '-400%',
  transformOrigin: 'bottom right',
  ease: "expo",
})

tl2.to([".slide_courses .s1",".slide_courses .s3"], {
    duration: 1,
    startAt: {
      translateY: '-400%'
    },

    translateX: '-100%',
    translateY: '0',

    scrollTrigger: {
      trigger: ".slide_courses",
      scrub: true
    }
  })
.to([".slide_courses .s2",".slide_courses .s4"], {
  duration: 10,
  startAt: {
    translateX: '-100%',
    translateY: '-400%'
  },

  translateX: '0%',
  translateY: '0',

  scrollTrigger: {
    trigger: ".slide_courses",
    scrub: true
  }
})
