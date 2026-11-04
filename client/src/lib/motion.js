// Position in a list as a CSS variable for the .enter classes; capped so a long list never waits.
export const stagger = (index) => ({ '--i': Math.min(index, 8) })

export const easeOutCubic = (t) => 1 - (1 - t) ** 3

export const prefersReducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
