
const FooterComponent = () => {
	const [value,setValue] = React.useState(0)

	React.useEffect( () => {
		setTimeout(() => setValue(value+1), 1000)
	})

	const handleSubmitSubscribe = console.log
	const handleSubmitCallback = console.log

	return <>
		<div className='row'>
			<div className="col-9 tagline uc">
				We see the <br/>world <br/>differently. <br/>we are <br/>designers.
			</div>
		</div>
		<div className="row form">
			<div className="col-6">
				<h3 className="uc yel">See the world <br/>differently too? <br/>Subscribe, be one of us</h3>
				<form >
					<input placeholder='email'/>
					<a href="#0" className="button">OK</a>
				</form>
				<div className='note'>We are too busy with our students to have thew time to span you. Read our <a href='#'>Privacy Policy</a></div>
			</div>
			<div className="col-6">
				<h3 className="uc yel">Want us to call you about the course? <br/>We love a chat!</h3>
				<form >
					<input placeholder='telephone'/>
					<a href="#0" className="button">OK</a>
				</form>
			</div>
		</div>
		<h3 className='uc sitemap'>Sitemap</h3>
		<div className="row">

			<div className="col-3 flex-col">
				<h4 className='uc'>Enrol</h4>
				<a href="#">Prices, Plans & Enrolment</a>
				<a href="#">Frequently Asked Questions</a>
				<a href="#">Terms & Conditions</a>
				<a href="#">Contact Us</a>
			</div>

			<div className="col-3 flex-col">
				<h4 className='uc'>Student Handbook</h4>
				<a href="#">About our courses</a>
				<a href="#">About The Graphic Design School</a>
				<a href="#">Help & Support</a>
				<a href="#">Study Online</a>
				<a href="#">Equipment I need</a>
				<a href="#">Fees & Plan</a>
			</div>

		</div>
		<div className="row">
			<div className="col-3 flex-col">
				<h4 className="uc">The Community</h4>
				<a href="#">Alumni & Social</a>
				<a href="#">Students Testimonials</a>
				<a href="#">Credits</a>

			</div>
			<div className="col-3 flex-col">
				<h4 className="uc">The School</h4>
				<a href="#">About us</a>
				<a href="#">Meet the tutors</a>
				<a href="#">Contact us</a>

			</div>
			<div className="col-3 flex-col">
				<h4 className="uc">Free Design Exercises</h4>
				<a href="#">Featured Video</a>
				<a href="#">DEX Library</a>
				<a href="#">DEX Gallery</a>

			</div>
			<div className="col-3 flex-col">
				<h4 className="uc">References</h4>
				<a href="#">Privacy</a>
				<a href="#">Copyright</a>
				<a href="#">Complaints & Appeals</a>
				<a href="#">Unique Student Identifier</a>

			</div>
		</div>
		<div className="row">
			<div className="col-9 flex-col">
				<h3 className="uc">Get in touch with us</h3>
				<a href='#' className='uc'>Australia 1300 655 485</a>
				<a href='#' className='uc'>International +61 1300 655 485</a>
				<address>
					<span className="uc">Address</span> PO BOX 569 - Avalon Beach NSW 2107 - Australia
				</address>
			</div>
		</div>
	</>
}

