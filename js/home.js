import './lib/_grid'

import gsap from 'gsap'
import { ScrollTrigger } from "gsap/ScrollTrigger";

const log = console.log, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

log('home -- ')

gsap.registerPlugin(ScrollTrigger);

ScrollTrigger.defaults({
	toggleActions: "play none reverse reset"
});

window.addEventListener( 'scroll', (e) => {
	let position = window.scrollY
	const cl = document.getElementById('hi').classList
	if( position >= 50 ) {
		cl.remove('title--full')
		cl.add('title--small')
	}
	else {
		cl.remove('title--small')
		cl.add('title--full')
	}
})

// gsap.to("#hi", {
// 		ease: 'expo',
// 		scale: .01,
// 		translateX: - window.innerWidth / 100 * 4,
// 		transformOrigin: 'top left',
// 		duration: 1.5,
// 		scrollTrigger: {
// 			markers: true
// 		}
// 	})


// const timeline = gsap.timeline();
// timeline
//   .to("#hello .box", {
//     delay: .75,
//     duration: 2.5,
//     translateY: '100%',
//     ease: "expo"
//   })
//

const st = i => `.slide_students .s${i}`
const offsets = [ '50%', '-100%', '25%', '-25%', '50%' ]

const allSlides = document.querySelectorAll('.slide_students > *')
log(allSlides)

const tl = gsap.timeline()

tl.to( '.slide_students .s1', {
	translateX: '-50%',
	transformOrigin: 'left center',
	scrollTrigger: {
		trigger: ".slide_students",
		scrub: true
	}
})

tl.from( '.slide_students .s3', {
	translateX: '-50%',
	transformOrigin: 'left center',
	scrollTrigger: {
		trigger: ".slide_students",
		scrub: true
	}
})

tl.to( '#banner h2.y', {
	translateX: '-50%',
	transformOrigin: 'left center',
	scrollTrigger: {
		trigger: "#banner",
		scrub: true
	}
})

tl.fromTo( '#banner h2.b', {
	translateX: '-50%'
},{
	translateX: '0',
	transformOrigin: 'left center',
	scrollTrigger: {
		trigger: "#banner",
		scrub: true
	}
})
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
