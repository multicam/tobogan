import './lib/_grid'

import gsap from 'gsap'
import { ScrollTrigger } from "gsap/ScrollTrigger";

const log = console.log, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

log('home -- ')

gsap.registerPlugin(ScrollTrigger);

ScrollTrigger.defaults({
	toggleActions: "restart pause resume pause"
});

gsap.to("#hi", {
		ease: 'expo',
		scale: .1,
		transformOrigin: 'top left',
		duration: 1.5,
		delay: .5,
		scrollTrigger: {
			trigger: "#hi-trigger",
			scrub: true
		}
	})


// const timeline = gsap.timeline();
// timeline
//   .to("#hello .box", {
//     delay: .75,
//     duration: 2.5,
//     translateY: '100%',
//     ease: "expo"
//   })
//
// const st = i => `.slide_students .s${i}`
// const offsets = [ '-50%', '25%', '-100%', '-25%', '50%' ]
//
// const allSlides = document.querySelectorAll('.slide_students > *')
// // allSlides.forEach(log)
// const t1 = gsap.timeline()
//
// allSlides.forEach( (sl,n) => {
// 	t1.to(st(n), {
// 		duration: 1,
// 		translateX: offsets[n],
// 		scrollTrigger: {
// 			trigger: ".slide_students",
// 			scrub: true
// 		}
// 	})
// 	log('*',n,sl)
// })

// const infinite = gsap.timeline({repeat:-1,paused: false})

// const me = document.querySelector('.marquee span')
// log(me)
// infinite.to('.marquee span', {
//     duration: 2.5,
//     x:`-${me.clientWidth}px`,
// 		repeat: -1
//   }
// )

//
// const t2 = gsap.timeline()
//
// t2.from(".slide_courses .s1",{
//   rotateZ: '90deg',
//   translateY: '-400%',
//   transformOrigin: 'bottom right',
//   ease: "expo",
// })
//
// t2
// .to([".slide_courses .s1",".slide_courses .s3"], {
//   duration: 1,
//   startAt: {
//     translateY: '-400%'
//   },
//
//   translateX: '-100%',
//   translateY: '0',
//
//   scrollTrigger: {
//     trigger: ".slide_courses",
//     scrub: true
//   }
// })
// .to([".slide_courses .s2",".slide_courses .s4"], {
//   duration: 10,
//   startAt: {
//     translateX: '-100%',
//     translateY: '-400%'
//   },
//
//   translateX: '0%',
//   translateY: '0',
//
//   scrollTrigger: {
//     trigger: ".slide_courses",
//     scrub: true
//   }
// })
