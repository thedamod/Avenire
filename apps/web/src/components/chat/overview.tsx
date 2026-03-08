import { motion } from "motion/react";

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-3xl mx-auto px-2"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="rounded-xl py-2 px-6 flex flex-col gap-8 leading-relaxed text-center max-w-xl overflow-visible">
        <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight leading-[1.2] lg:text-5xl text-grad">
          Hey there!
        </h1>
      </div>
    </motion.div>
  );
};
