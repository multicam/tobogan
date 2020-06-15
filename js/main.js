import './_grid'
import gsap from 'gsap'
import { ScrollTrigger } from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

ScrollTrigger.defaults({
  toggleActions: "restart pause resume pause"
});
const timeline = gsap.timeline();
timeline
  .to(".box", {
    duration: .75,
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

gsap.to(".s1", { duration: 1, translateX: '-50%', scrollTrigger: {
  trigger: ".slide",
    scrub: true
  } })

gsap.to(".s3", { duration: 1, translateX: '50%', scrollTrigger: {
  trigger: ".slide",
    scrub: true
  } })

