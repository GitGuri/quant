// src/lib/initHighcharts.ts (or your relevant path)
import Highcharts from 'highcharts';

// Core extensions FIRST
import HighchartsMore from 'highcharts/highcharts-more';
import Exporting from 'highcharts/modules/exporting';
import ExportData from 'highcharts/modules/export-data';
import Accessibility from 'highcharts/modules/accessibility';

// WOW modules (note the exact names)
import Sankey from 'highcharts/modules/sankey';
import DependencyWheel from 'highcharts/modules/dependency-wheel'; // needs sankey
import Networkgraph from 'highcharts/modules/networkgraph';
import Streamgraph from 'highcharts/modules/streamgraph';
import Sunburst from 'highcharts/modules/sunburst';
// import PackedBubble from 'highcharts/modules/packed-bubble'; // Currently commented out
import Variwide from 'highcharts/modules/variwide';
import SolidGauge from 'highcharts/modules/solid-gauge'; // needs highcharts-more
import Annotations from 'highcharts/modules/annotations';

// --- NEWLY ADDED MODULES ---
// For Heatmap chart
import Heatmap from 'highcharts/modules/heatmap';
// For Calendar chart (often used with heatmap or timeline approach)
// Note: Highcharts doesn't have a specific 'timeline' module for calendars,
// but the 'timeline' series type exists for other purposes.
// We'll add it in case it's needed, but primarily heatmap is used for calendar grids.
// If you specifically need the Timeline series type:
// import Timeline from 'highcharts/modules/timeline';

// --- END NEWLY ADDED MODULES ---

// Init in the right order
HighchartsMore(Highcharts);
Exporting(Highcharts);
ExportData(Highcharts);
Accessibility(Highcharts);

Sankey(Highcharts);
DependencyWheel(Highcharts);
Networkgraph(Highcharts);
Streamgraph(Highcharts);
Sunburst(Highcharts);
// PackedBubble(Highcharts); // Currently commented out
Variwide(Highcharts);
SolidGauge(Highcharts);
Annotations(Highcharts);

// --- INITIALIZE NEWLY ADDED MODULES ---
Heatmap(Highcharts);
// Timeline(Highcharts); // Initialize if you uncommented the import above
// --- END INITIALIZE NEWLY ADDED MODULES ---

// Optional: silence accessibility warning or keep it enabled
Highcharts.setOptions({
  accessibility: { enabled: false },
  chart: { backgroundColor: 'transparent' }
});

// Sanity log (only once on boot). You can remove later.
if (import.meta.env.DEV) {
  // These must be truthy if modules loaded
  console.log('[HC modules]',
    !!Highcharts.seriesTypes.sankey,
    !!Highcharts.seriesTypes.dependencywheel,
    !!Highcharts.seriesTypes.networkgraph,
    !!Highcharts.seriesTypes.streamgraph,
    !!Highcharts.seriesTypes.sunburst,
    // !!Highcharts.seriesTypes.packedbubble, // Currently commented out
    !!Highcharts.seriesTypes.variwide,
    !!Highcharts.seriesTypes.solidgauge,
    // --- NEW MODULE CHECKS ---
    !!Highcharts.seriesTypes.heatmap
    // !!Highcharts.seriesTypes.timeline // Add if you imported/initialized Timeline
    // --- END NEW MODULE CHECKS ---
  );
}

export default Highcharts;