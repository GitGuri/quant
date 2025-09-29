// src/lib/initHighcharts.ts
import Highcharts from 'highcharts';

// Core
import HighchartsMore from 'highcharts/highcharts-more';
import Exporting from 'highcharts/modules/exporting';
import ExportData from 'highcharts/modules/export-data';
import Accessibility from 'highcharts/modules/accessibility';

// Families
import Sankey from 'highcharts/modules/sankey';
import DependencyWheel from 'highcharts/modules/dependency-wheel'; // requires sankey
import Networkgraph from 'highcharts/modules/networkgraph';
import Streamgraph from 'highcharts/modules/streamgraph';
import Sunburst from 'highcharts/modules/sunburst';
import Variwide from 'highcharts/modules/variwide';
import SolidGauge from 'highcharts/modules/solid-gauge'; // requires highcharts-more
import Annotations from 'highcharts/modules/annotations';
import Heatmap from 'highcharts/modules/heatmap';

// NEW: needed for the sales dashboard you asked for
import Pareto from 'highcharts/modules/pareto';
import Funnel from 'highcharts/modules/funnel';
import Histogram from 'highcharts/modules/histogram-bellcurve';
//import PackedBubble from 'highcharts/modules/packed-bubble';

// init order matters
HighchartsMore(Highcharts);
Exporting(Highcharts);
ExportData(Highcharts);
Accessibility(Highcharts);

Sankey(Highcharts);
DependencyWheel(Highcharts);
Networkgraph(Highcharts);
Streamgraph(Highcharts);
Sunburst(Highcharts);
Variwide(Highcharts);
SolidGauge(Highcharts);
Annotations(Highcharts);
Heatmap(Highcharts);

// NEW modules
Pareto(Highcharts);
Funnel(Highcharts);
Histogram(Highcharts);
//PackedBubble(Highcharts);

// global opts
Highcharts.setOptions({
  accessibility: { enabled: false },
  chart: { backgroundColor: 'transparent' 
  },
  // --- Add this section to remove credits ---
  credits: {
    enabled: false // This disables the Highcharts.com credits
  }
  // --- End credits section ---
});

// dev sanity check
if (import.meta.env.DEV) {
  console.log('[HC modules]',
    !!Highcharts.seriesTypes.dependencywheel,
    !!Highcharts.seriesTypes.networkgraph,
    !!Highcharts.seriesTypes.sunburst,
    !!Highcharts.seriesTypes.variwide,
    !!Highcharts.seriesTypes.solidgauge,
    !!Highcharts.seriesTypes.heatmap,
    !!Highcharts.seriesTypes.pareto,
    !!Highcharts.seriesTypes.funnel,
    !!Highcharts.seriesTypes.histogram,
    //!!Highcharts.seriesTypes.packedbubble,
  );
}

export default Highcharts;
