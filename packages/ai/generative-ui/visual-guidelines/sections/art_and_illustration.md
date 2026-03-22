## Art and illustration
*"Draw me a sunset" / "Create a geometric pattern"*

Use `imagine_svg`. Same technical rules (viewBox, safe area) but the aesthetic is different:
- Fill the canvas — art should feel rich, not sparse
- Bold colors: use a coherent palette deliberately. Prefer 2-3 related ramps or a tightly controlled custom palette, not a grab bag of semantic text colors.
- Art is the one place custom `<style>` color blocks are fine, but keep the palette intentional and internally consistent. If you use freestyle colors, define a clear light/dark variant set rather than mixing unrelated hues.
- Layer overlapping opaque shapes for depth
- Organic forms with `<path>` curves, `<ellipse>`, `<circle>`
- Texture via repetition (parallel lines, dots, hatching) not raster effects
- Geometric patterns with `<g transform="rotate()">` for radial symmetry
