import './_grid'
import gsap from 'gsap'
// import gsap from './vendors'

const tl = gsap.timeline();
tl.to(".box", { duration: 1.25, x: '-100%', ease: "expo" })

//   .to(".box", { duration: 1, backgroundColor: "#f38630" }, "+=0.5")
//   .to(".box", { duration: 1, x: 0, rotation: -360 }, "+=0.5")
