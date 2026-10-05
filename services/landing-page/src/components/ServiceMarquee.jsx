import React from "react";
import { SERVICE_CATEGORIES } from "../constants";

/** The service menu every Go Salon business builds from, drifting past. */
const ServiceMarquee = () => {
  const row = [...SERVICE_CATEGORIES, ...SERVICE_CATEGORIES];
  return (
    <div className="mask-fade-x relative overflow-hidden border-b border-gold/10 bg-obsidian py-7" aria-hidden="true">
      <div className="animate-marquee flex w-max items-center">
        {[...row, ...row].map((name, i) => (
          <span key={i} className="flex items-center">
            <span className="px-8 text-2xl font-light italic tracking-tight text-ivory/80 sm:text-3xl">
              {name}
            </span>
            <span className="text-gold">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
};

export default ServiceMarquee;
