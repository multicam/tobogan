import './lib/_grid'

import gsap from 'gsap'
import { ScrollTrigger } from "gsap/ScrollTrigger";

const log = console.log, serialize = JSON.stringify, deserialize = JSON.parse, keysOf = Object.keys

log('home -- ')

gsap.registerPlugin(ScrollTrigger);

ScrollTrigger.defaults({
	toggleActions: "play none reverse reset"
});

const getCssVariable = (el,varName) => getComputedStyle(el).getPropertyValue(varName)
const getVw = str => str && str.replace('vw','')

window.addEventListener( 'scroll', (e) => {

	const el = document.getElementById('hi'),
		scrollAnchor = Math.floor(
			window.innerWidth / 100. * getVw(getCssVariable(el, '--padding-y')) / 2 + 1
		)

	if( window.scrollY > scrollAnchor ) {
		el.classList.remove( 'title--full' )
		el.classList.add( 'title--small' )

		document.getElementById('header').style.setProperty('background', 'var(--yellow)')
	}
	else {
		el.classList.remove( 'title--small' )
		el.classList.add( 'title--full' )

		document.getElementById('header').style.setProperty('background', 'transparent')
	}

})

// -- student work slider

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

// -- tutors banner

tl.to( '#banner h2.y', {
	translateX: '-50%',
	transformOrigin: 'left center',
	scrollTrigger: {
		trigger: "#banner",
		scrub: true
	}
})

// tl.fromTo( '#banner h2.b', {
// 	translateX: '-50%'
// },{
// 	translateX: '0',
// 	transformOrigin: 'left center',
// 	scrollTrigger: {
// 		trigger: "#banner",
// 		scrub: true
//  	}
// })
