import React from "react";
import { MotionConfig } from "framer-motion";

import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import ServiceMarquee from "./components/ServiceMarquee";
import TryOnSpotlight from "./components/TryOnSpotlight";
import AppTour from "./components/AppTour";
import Booking from "./components/Booking";
import ForSalons from "./components/ForSalons";
import Pricing from "./components/Pricing";
import Faq from "./components/Faq";
import FinalCta from "./components/FinalCta";
import Footer from "./components/Footer";

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen w-full overflow-x-clip bg-onyx font-sans">
        <Navbar />
        <main>
          <Hero />
          <ServiceMarquee />
          <TryOnSpotlight />
          <AppTour />
          <Booking />
          <ForSalons />
          <Pricing />
          <Faq />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}

export default App;
