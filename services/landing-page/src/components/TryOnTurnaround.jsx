import React, { useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import {
  ChevronLeft,
  Download,
  MoreVertical,
  Orbit,
  Pause,
  Play,
  RotateCw,
  Share2,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import PhoneFrame from "./ui/PhoneFrame";

/* A 360° result from the app's own pipeline, of the man on the processing
   screen: his photo given the cut, then turned a full circle. 720² H.264,
   silent, under five seconds; the last quarter-second dissolves into the
   first, so it loops without a jump. */
const RESULT = {
  src: "/media/tryon-360-result.mp4",
  poster: "/media/tryon-360-result-poster.jpg",
  style: "Textured Crop & Fade",
};

const ANGLES = [
  { label: "Front", className: "left-[9%] top-[9%]" },
  { label: "Side", className: "right-[9%] top-[9%]" },
  { label: "Back", className: "bottom-[9%] right-[9%]" },
  { label: "Side", className: "bottom-[9%] left-[9%]" },
];

/* Which way the head faces, as a share of the clip, indexing ANGLES. Read
   off the frames of tryon-360-result.mp4, so they hold for that clip only. */
const TURN = [
  [0.23, 0],
  [0.41, 1],
  [0.64, 2],
  [0.835, 3],
  [1, 0],
];
const angleAt = (share) => (TURN.find(([until]) => share < until) ?? TURN[0])[1];

/* The phone holds on "Making your 360° video" long enough to be read, then
   turns away — the same way the head in the clip turns — and comes round on
   the finished result. The clip starts just before its face swings in, so
   the turn is already under way as it appears. */
const HOLD = 2.4;
const REST = -180;
const REVEAL = -72;

/* Handset depth in cqw of the phone's width. Stacked slices give the body
   its rounded silhouette at an angle; two side walls carry it edge-on, where
   the slices thin to nothing. Brightest mid-depth, like a polished frame. */
const DEPTH = 7;
const EDGE_DARK = [31, 26, 21];
const EDGE_LIGHT = [118, 98, 74];
const SLICES = Array.from({ length: 10 }, (_, i) => {
  const t = (i + 0.5) / 10;
  const k = Math.sin(Math.PI * t) ** 1.5;
  const [r, g, b] = EDGE_DARK.map((v, c) => Math.round(v + (EDGE_LIGHT[c] - v) * k));
  return { z: (t - 0.5) * DEPTH, color: `rgb(${r} ${g} ${b})` };
});
const WALL =
  "linear-gradient(180deg, rgba(255,240,220,0.14), transparent 35%, rgba(0,0,0,0.3)), " +
  `linear-gradient(90deg, rgb(${EDGE_DARK}), rgb(${EDGE_LIGHT}) 50%, rgb(${EDGE_DARK}))`;

const LABEL_IDLE = "border-gold/25 bg-obsidian/80 text-gold";
const LABEL_LIT =
  "border-gold/60 bg-umber/90 text-gold-light shadow-[0_0_26px_-6px_rgba(224,176,120,0.75)]";

const hidden3d = { backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" };

/** One side of the handset. At rest it is a plain, flat phone — no 3D, so
    the glass rasterises exactly as a still one does. While turning it sits
    on the body's surface, with the light that moves across it and the shadow
    it falls into as it turns from the viewer. `behind` hides it once it has
    turned past edge-on, so a browser that flattens 3D still shows the right
    side instead of the other one, mirrored; `away` takes it out of the
    accessibility tree a little earlier, as the other side starts to show. */
const Face = ({ back = false, turning, glare, shade, behind, away, children }) => (
  <div
    className={back ? "absolute inset-0" : "relative"}
    style={{
      ...(turning && {
        ...hidden3d,
        transform: `${back ? "rotateY(180deg) " : ""}translateZ(${DEPTH / 2}cqw)`,
      }),
      visibility: behind ? "hidden" : undefined,
    }}
    aria-hidden={away || undefined}
    inert={away || undefined}
  >
    {children}
    {turning && (
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2.6rem]">
        <motion.div
          style={{ x: glare, skewX: -16 }}
          className="absolute -inset-y-[10%] left-0 w-1/2 bg-gradient-to-r from-transparent via-white/[0.15] to-transparent"
        />
        <motion.div style={{ opacity: shade }} className="absolute inset-0 bg-black" />
      </div>
    )}
  </div>
);

/** The app's "Your result" screen, drawn live so the 360° clip can play in it. */
const ResultScreen = ({ clip, load, playing, onToggle }) => (
  <div className="absolute inset-0 flex flex-col px-[4.5cqw] pb-[2.5cqw]">
    <div className="flex h-[13cqw] shrink-0 items-center justify-between">
      <span className="flex items-center gap-[1cqw]">
        <ChevronLeft className="-ml-[1.5cqw] h-[6.4cqw] w-[6.4cqw]" strokeWidth={2.2} />
        <span className="text-[4.6cqw] font-semibold tracking-[-0.01em]">Your result</span>
      </span>
      <span className="flex items-center gap-[4cqw] text-ivory-soft">
        <Download className="h-[5.2cqw] w-[5.2cqw]" />
        <Share2 className="h-[5.2cqw] w-[5.2cqw]" />
        <MoreVertical className="h-[5.2cqw] w-[5.2cqw]" />
      </span>
    </div>

    <div className="relative mt-[1.5cqw] aspect-[3/4] shrink-0 overflow-hidden rounded-[5cqw] bg-onyx shadow-[inset_0_0_0_1px_rgba(224,176,120,0.14)]">
      <video
        ref={clip}
        className="absolute inset-0 h-full w-full cursor-pointer object-cover"
        src={load ? RESULT.src : undefined}
        poster={load ? RESULT.poster : undefined}
        muted
        loop
        playsInline
        preload="auto"
        onClick={onToggle}
        aria-label={`A Go Salon 360° try-on: ${RESULT.style}, turning a full circle`}
      />
      <span className="absolute left-[3cqw] top-[3cqw] inline-flex items-center gap-[1.2cqw] rounded-full bg-black/55 px-[2.6cqw] py-[1.3cqw] text-[3cqw] font-semibold leading-none text-white">
        <Orbit className="h-[3.2cqw] w-[3.2cqw]" /> 360°
      </span>
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? "Pause the 360° video" : "Play the 360° video"}
        className="absolute bottom-[3cqw] right-[3cqw] grid h-[10cqw] w-[10cqw] place-items-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
      >
        {playing ? (
          <Pause className="h-[4.6cqw] w-[4.6cqw]" fill="currentColor" strokeWidth={0} />
        ) : (
          <Play className="ml-[0.5cqw] h-[4.6cqw] w-[4.6cqw]" fill="currentColor" strokeWidth={0} />
        )}
      </button>
    </div>

    <div className="mt-[3.5cqw] flex items-center justify-between gap-[2cqw]">
      <span className="inline-flex min-w-0 items-center gap-[1.4cqw] rounded-full bg-gold/[0.12] px-[2.8cqw] py-[1.4cqw] text-[3.1cqw] font-medium leading-none text-gold">
        <Sparkles className="h-[3.4cqw] w-[3.4cqw] shrink-0" />
        <span className="truncate">{RESULT.style}</span>
      </span>
      <span className="shrink-0 text-[3cqw] text-taupe">Just now</span>
    </div>

    <p className="mt-[4.5cqw] text-[3.7cqw] font-medium">How does it look?</p>
    <div className="mt-[2.2cqw] grid grid-cols-2 gap-[2.5cqw] text-[3.3cqw]">
      <span className="flex h-[9.5cqw] items-center justify-center gap-[1.6cqw] rounded-full border border-gold/50 bg-gold/10 text-gold">
        <ThumbsUp className="h-[3.8cqw] w-[3.8cqw]" /> Like
      </span>
      <span className="flex h-[9.5cqw] items-center justify-center gap-[1.6cqw] rounded-full border border-ivory/15 text-ivory-soft">
        <ThumbsDown className="h-[3.8cqw] w-[3.8cqw]" /> Not for me
      </span>
    </div>

    <div className="mt-auto grid grid-cols-2 gap-[2.5cqw] text-[3.6cqw] font-medium">
      <span className="grid h-[11.5cqw] place-items-center rounded-full border border-ivory/15 text-ivory">
        Try another
      </span>
      <span className="btn-satin grid h-[11.5cqw] place-items-center rounded-full">Book this look</span>
    </div>
    <span className="mx-auto mt-[3cqw] block h-[1.2cqw] w-[34cqw] shrink-0 rounded-full bg-ivory/70" />
  </div>
);

/** The turnaround: the app at the centre of an orbit marking each angle. It
    opens on the processing screen, then turns the handset round to the
    finished 360° video — and while that plays, the angle the head has reached
    lights up on the orbit. */
const TryOnTurnaround = ({ processing }) => {
  const stage = useRef(null);
  const clip = useRef(null);
  const pausedByViewer = useRef(false);
  const reduceMotion = useReducedMotion();

  const near = useInView(stage, { once: true, margin: "600px 0px" });
  const shown = useInView(stage, { once: true, amount: 0.6 });
  const onScreen = useInView(stage, { amount: 0.15 });

  const [turning, setTurning] = useState(false);
  const [past, setPast] = useState(false); // beyond edge-on: the result side faces out
  const [revealed, setRevealed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [angle, setAngle] = useState(null);

  const rotateY = useMotionValue(0);
  // 0 face-on, 1 edge-on: the handset lifts and tips a touch mid-turn, as in a hand.
  const swing = useTransform(rotateY, (v) => Math.sin((Math.min(Math.abs(v), 180) * Math.PI) / 180));
  const rotateX = useTransform(swing, (s) => s * 4);
  const scale = useTransform(swing, (s) => 1 - s * 0.05);
  const lift = useTransform(swing, (s) => s * -10);
  const shade = useTransform(swing, (s) => s * 0.6);
  // The streak is skewed, so it starts and ends well clear of the glass.
  const frontGlare = useTransform(rotateY, [0, -90], ["-200%", "300%"]);
  const backGlare = useTransform(rotateY, [-90, -180], ["-200%", "300%"]);
  const bloom = useTransform(rotateY, [-60, -150, -180], [0, 0.9, 0.45]);

  useMotionValueEvent(rotateY, "change", (v) => {
    setPast(v <= -90);
    if (v <= REVEAL) setRevealed(true);
  });

  // The handset is only 3D while it turns, so both resting screens stay crisp.
  useEffect(() => {
    if (!shown) return;
    let turn;
    const start = setTimeout(() => {
      if (reduceMotion) {
        rotateY.set(REST);
        return;
      }
      setTurning(true);
      turn = animate(rotateY, REST, {
        type: "spring",
        visualDuration: 1.7,
        bounce: 0.14,
        onComplete: () => setTurning(false),
      });
    }, HOLD * 1000);
    return () => {
      clearTimeout(start);
      turn?.stop();
    };
  }, [shown, reduceMotion, rotateY]);

  // Plays once it has turned in — unless the viewer asked for less motion or
  // paused it — and rests while the section is scrolled away.
  useEffect(() => {
    const video = clip.current;
    if (!video || !revealed) return;
    if (!onScreen) video.pause();
    else if (!reduceMotion && !pausedByViewer.current) video.play().catch(() => {});
  }, [revealed, onScreen, reduceMotion]);

  useEffect(() => {
    const video = clip.current;
    if (!video || !playing) return;
    let frame = 0;
    const follow = () => {
      if (video.duration) setAngle(angleAt(video.currentTime / video.duration));
      frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    const video = clip.current;
    if (!video) return;
    const sync = () => setPlaying(!video.paused);
    video.addEventListener("play", sync);
    video.addEventListener("pause", sync);
    return () => {
      video.removeEventListener("play", sync);
      video.removeEventListener("pause", sync);
    };
  }, []);

  const toggle = () => {
    const video = clip.current;
    if (!video) return;
    pausedByViewer.current = !video.paused;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  return (
    <div ref={stage} className="relative mx-auto aspect-square w-full max-w-[34rem]">
      <div className="absolute inset-[4%] rounded-full border border-dashed border-gold/25" />
      <div className="absolute inset-[14%] rounded-full border border-gold/10" />
      <div className="animate-orbit absolute inset-[4%]">
        <span className="absolute left-1/2 top-0 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-[0_0_24px_6px_rgba(224,176,120,0.55)]" />
      </div>
      {ANGLES.map((a, i) => (
        <span
          key={i}
          className={`absolute z-20 rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] backdrop-blur transition-[color,background-color,border-color,box-shadow] duration-500 ${a.className} ${
            angle === i ? LABEL_LIT : LABEL_IDLE
          }`}
        >
          {a.label}
        </span>
      ))}

      <div className="@container absolute left-1/2 top-1/2 z-10 w-[46%] -translate-x-1/2 -translate-y-1/2">
        <div className="relative" style={turning ? { perspective: "520cqw" } : undefined}>
          <motion.div
            aria-hidden="true"
            style={{ opacity: bloom }}
            className="pointer-events-none absolute -inset-[30%] rounded-full bg-[radial-gradient(closest-side,rgba(224,176,120,0.3),transparent)]"
          />
          {/* Set back by half its depth so the glass sits where the flat
              phone does — same plane, same size — at either end of the turn. */}
          <motion.div
            className="relative"
            transformTemplate={turning ? undefined : () => "none"}
            style={{
              z: `${-DEPTH / 2}cqw`,
              rotateY,
              rotateX,
              scale,
              y: lift,
              transformStyle: turning ? "preserve-3d" : "flat",
            }}
          >
            {turning &&
              SLICES.map(({ z, color }) => (
                <div
                  key={z}
                  className="absolute inset-0 rounded-[2.6rem]"
                  style={{ transform: `translateZ(${z}cqw)`, backgroundColor: color }}
                />
              ))}
            {turning &&
              [-1, 1].map((side) => (
                <div
                  key={side}
                  className="absolute inset-y-[1.6rem] rounded-full"
                  style={{
                    ...hidden3d,
                    left: side < 0 ? 0 : "100%",
                    width: `${DEPTH}cqw`,
                    marginLeft: `${-DEPTH / 2}cqw`,
                    transform: `rotateY(${side * 90}deg)`,
                    backgroundImage: WALL,
                  }}
                />
              ))}

            <Face turning={turning} glare={frontGlare} shade={shade} behind={past} away={revealed}>
              {processing ? (
                <PhoneFrame
                  src={processing.src}
                  theme={processing.theme}
                  alt="Go Salon making a 360° try-on video"
                />
              ) : (
                <div className="grid aspect-[390/891] place-items-center rounded-[2.6rem] border border-gold/20 bg-umber">
                  <RotateCw className="text-gold" size={40} />
                </div>
              )}
            </Face>

            <Face back turning={turning} glare={backGlare} shade={shade} behind={!past} away={!revealed}>
              <PhoneFrame theme="dark">
                <ResultScreen clip={clip} load={near} playing={playing} onToggle={toggle} />
              </PhoneFrame>
            </Face>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default TryOnTurnaround;
