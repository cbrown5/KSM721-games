This game challenges the user to fit a linear regression to randomly generated data and get as close as possible to the maximum likelihood solution. The user can drag the intercept and slope of a line, then press Submit to record an attempt. Each attempt computes the log-likelihood for the chosen parameters and plots it against attempt number on a second graph. The user keeps iterating until they are within a chosen tolerance of the maximum likelihood. At that point, trigger a celebratory animation (e.g., data points turning into guinea pigs that bounce around the screen).

Constraints
- Hostable on GitHub Pages.
- One HTML file (or one HTML plus one JS file).
- Use Phaser.js for graphics.
- Include audio cues to make the game engaging.
- Likelihood calculations must be scientifically accurate.

Implementation plan
0) Difficulty selection
- Start screen asks the user to select a difficulty level.
- Easy: strong signal (high slope relative to noise), line is visually obvious.
- Medium: moderate noise, line is visible but not immediate.
- Hard: high noise, slope is barely perceivable.
- Implement by scaling $\sigma$ (or SNR) per level while keeping $\beta_1$ fixed.

1) Data generation
- Generate $n$ points from a linear model $y = \beta_0 + \beta_1 x + \epsilon$ with $\epsilon \sim \mathcal{N}(0, \sigma^2)$.
- Use a fixed seed option for repeatability during testing.

2) MLE reference
- Compute the closed-form OLS estimates for $\hat{\beta}_0, \hat{\beta}_1$ and $\hat{\sigma}^2$.
- Use these as the maximum likelihood target for the game.

3) Likelihood calculation
- For a user-selected $(\beta_0, \beta_1)$, compute residuals and the Gaussian log-likelihood:
	$$\log L = -\frac{n}{2}\log(2\pi\sigma^2) - \frac{1}{2\sigma^2}\sum_{i=1}^n (y_i - \beta_0 - \beta_1 x_i)^2$$
- Decide whether $\sigma^2$ is fixed (simpler for play) or estimated from residuals (closer to true MLE). Document the choice.

4) Game UI
- Main plot: scatter of data and draggable regression line.
- Side panel: current $(\beta_0, \beta_1)$ values and current log-likelihood.
- Secondary plot: log-likelihood vs attempt number.

5) Interaction flow
- Drag intercept and slope handles to adjust the line.
- Submit button records an attempt and updates the likelihood plot.
- Display progress toward the MLE target and success threshold.

6) Feedback and celebration
- Audio feedback on submit and on improvement.
- Success animation (e.g., data points turn into bouncing guinea pigs).

7) Packaging
- Single-page app with Phaser.js via CDN.
- Ensure assets are local or CDN-hosted for GitHub Pages.