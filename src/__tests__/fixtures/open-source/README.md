# Open-source email fixtures

These files are copied from upstream repositories recorded in `provenance.json`. The upstream corpus contains 77 pinned examples from 17 repositories, with an upstream license notice retained in each source folder. Licenses include MIT and Apache-2.0. Keep those notices and provenance metadata with the fixtures; do not present the upstream designs as Emailens-created gallery templates.

The corpus includes standalone HTML, React Email TSX, MJML source, Maizzle project templates, and Maizzle production HTML. The benchmark compiles the React Email and MJML source through Emailens before timing engine stages. React Email samples are normalized at runtime to remove project-only theme imports, use the supported component package name, substitute a fixed example base URL, and omit theme-only font/config components. Maizzle examples retain their pinned source/build form because they rely on project configuration; prebuilt outputs are included as HTML fixtures.

Emailens-authored synthetic stress fixtures are kept separately under `../synthetic/`, with their own manifest. They cover patterns missing or rare in the upstream corpus, including RTL and dark mode, VML branches, CSS variables and animation, modern image sources, AMP forms, template markers, and minimal text-first HTML.

These fixtures are used only for engine regression coverage and performance benchmarking. They are not customer-facing template-gallery assets. For gallery-inspired cases without an explicit reuse license, author synthetic messages from generic patterns instead of copying gallery HTML, images, or screenshots.
