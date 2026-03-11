import { motion } from "motion/react";

export const Overview = () => {
  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-3xl px-2"
      exit={{ opacity: 0, y: 8 }}
      initial={{ opacity: 0, y: 12 }}
      key="overview"
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      <div className="mx-auto max-w-xl rounded-xl border border-border/70 bg-card px-5 py-4 text-center">
        <p className="font-medium text-foreground text-sm">Hey There!</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Search across uploaded material, attach files, or type{" "}
          <span className="font-medium text-foreground">@</span> to cite a
          workspace file.
        </p>
      </div>
    </motion.div>
  );
};
