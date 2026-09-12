/*
 * شبكة تدفّق صحيحة — الأساس الرياضي للمِرصد.
 *
 * لا تعرف هذه الوحدة شيئًا عن القرآن ولا عن المتسابقين: عُقَد وأقواس وسعات وتكاليف صحيحة
 * فقط. وهذا مقصود — الصواب هنا يُثبَت بالخوارزمية لا بالمجال، فمتى صحّ التدفّق صحّ ما
 * بُني عليه.
 *
 * ثلاث عمليات:
 *   · `maxFlow`   — دِنِتش. أكبر تدفّق ممكن من المنبع إلى المصبّ.
 *   · `minCut`    — الحاجز الأدنى بعد التشبّع: شاهد بنيوي على سبب التوقف، لا رسالة خطأ.
 *   · `minCostMaxFlow` — أقصر المسارات المتعاقبة بجهود (Johnson potentials) ثم دَيْكسترا.
 *
 * والتكاليف كلها صحيحة وغير سالبة عمدًا: العائم يجعل «أقلّ تكلفة» عبارةً تقريبية، وهذه
 * الوحدة تُستعمل لإثبات المثالية لا للتقدير. ومن أراد وزنًا كسريًا ضربه في مضاعفٍ معلن
 * قبل أن يسلّمه (انظر `COST_SCALE`).
 */

/** مضاعف تحويل الأوزان الكسرية إلى تكاليف صحيحة. معلن كي لا يُظنّ الحساب عائمًا. */
export const COST_SCALE = 1000;

/** تحويل وزن كسري إلى تكلفة صحيحة غير سالبة. */
export const toIntegerCost = (value: number) => Math.max(0, Math.round(value * COST_SCALE));

export interface MinCostResult {
  flow: number;
  /** التكلفة بوحدات `COST_SCALE`. اقسمها على `COST_SCALE` لقراءتها بالوزن الأصلي. */
  cost: number;
  /** صحيح إذا بلغ الحلّ الأمثل المُثبَت؛ خطأ إذا أُوقف عند سقف التكرار. */
  proven: boolean;
  iterations: number;
}

/**
 * شبكة تدفّق بأقواس مزدوجة (كل قوس ونقيضه متجاوران في المصفوفة، فالنقيض هو `index ^ 1`).
 * التمثيل بمصفوفات مسطّحة لا بكائنات: عشرات الآلاف من الأقواس تمرّ في ذاكرة متّصلة.
 */
export class FlowNetwork {
  readonly nodeCount: number;
  private readonly head: Int32Array;
  private edgeTo: Int32Array;
  private edgeNext: Int32Array;
  private edgeCap: Float64Array;
  private edgeCost: Float64Array;
  private edgeCount = 0;

  private readonly level: Int32Array;
  private readonly iter: Int32Array;

  constructor(nodeCount: number, expectedEdges = 16) {
    this.nodeCount = nodeCount;
    this.head = new Int32Array(nodeCount).fill(-1);
    const capacity = Math.max(2, expectedEdges * 2);
    this.edgeTo = new Int32Array(capacity);
    this.edgeNext = new Int32Array(capacity);
    this.edgeCap = new Float64Array(capacity);
    this.edgeCost = new Float64Array(capacity);
    this.level = new Int32Array(nodeCount);
    this.iter = new Int32Array(nodeCount);
  }

  private grow() {
    if (this.edgeCount + 2 <= this.edgeTo.length) return;
    const size = Math.max(4, this.edgeTo.length * 2);
    const to = new Int32Array(size); to.set(this.edgeTo); this.edgeTo = to;
    const next = new Int32Array(size); next.set(this.edgeNext); this.edgeNext = next;
    const cap = new Float64Array(size); cap.set(this.edgeCap); this.edgeCap = cap;
    const cost = new Float64Array(size); cost.set(this.edgeCost); this.edgeCost = cost;
  }

  /** يضيف قوسًا موجّهًا ونقيضه. يعيد فهرس القوس الأمامي. */
  addEdge(from: number, to: number, capacity: number, cost = 0): number {
    if (capacity < 0) throw new Error('FLOW_NEGATIVE_CAPACITY');
    if (cost < 0) throw new Error('FLOW_NEGATIVE_COST');
    this.grow();
    const index = this.edgeCount;
    this.edgeTo[index] = to; this.edgeCap[index] = capacity; this.edgeCost[index] = cost;
    this.edgeNext[index] = this.head[from]; this.head[from] = index;
    this.edgeTo[index + 1] = from; this.edgeCap[index + 1] = 0; this.edgeCost[index + 1] = -cost;
    this.edgeNext[index + 1] = this.head[to]; this.head[to] = index + 1;
    this.edgeCount += 2;
    return index;
  }

  /** التدفّق الجاري في قوسٍ أمامي = سعة نقيضه. */
  flowOf(edgeIndex: number): number { return this.edgeCap[edgeIndex ^ 1]; }

  residualOf(edgeIndex: number): number { return this.edgeCap[edgeIndex]; }

  /** إعادة كل الأقواس إلى سعاتها الأصلية دون إعادة بناء الشبكة. */
  resetFlow() {
    for (let i = 0; i < this.edgeCount; i += 2) {
      const used = this.edgeCap[i + 1];
      this.edgeCap[i] += used;
      this.edgeCap[i + 1] = 0;
    }
  }

  /** تغيير سعة قوسٍ أمامي بلا تدفّق جارٍ (يُستعمل في البحث البارامتري على السقف). */
  setCapacity(edgeIndex: number, capacity: number) {
    if (this.edgeCap[edgeIndex ^ 1] !== 0) throw new Error('FLOW_CAPACITY_CHANGE_WITH_ACTIVE_FLOW');
    this.edgeCap[edgeIndex] = Math.max(0, capacity);
  }

  private bfs(source: number, sink: number): boolean {
    this.level.fill(-1);
    const queue = new Int32Array(this.nodeCount);
    let qh = 0, qt = 0;
    this.level[source] = 0; queue[qt++] = source;
    while (qh < qt) {
      const node = queue[qh++];
      for (let e = this.head[node]; e !== -1; e = this.edgeNext[e]) {
        const next = this.edgeTo[e];
        if (this.edgeCap[e] > 0 && this.level[next] < 0) { this.level[next] = this.level[node] + 1; queue[qt++] = next; }
      }
    }
    return this.level[sink] >= 0;
  }

  private dfs(node: number, sink: number, limit: number): number {
    if (node === sink) return limit;
    for (; this.iter[node] !== -1; this.iter[node] = this.edgeNext[this.iter[node]]) {
      const e = this.iter[node];
      const next = this.edgeTo[e];
      if (this.edgeCap[e] <= 0 || this.level[next] !== this.level[node] + 1) continue;
      const pushed = this.dfs(next, sink, Math.min(limit, this.edgeCap[e]));
      if (pushed > 0) { this.edgeCap[e] -= pushed; this.edgeCap[e ^ 1] += pushed; return pushed; }
    }
    return 0;
  }

  /** دِنِتش: أكبر تدفّق. يضيف إلى ما جرى من تدفّق سابق إن وُجد. */
  maxFlow(source: number, sink: number, upperBound = Number.POSITIVE_INFINITY): number {
    let total = 0;
    while (total < upperBound && this.bfs(source, sink)) {
      for (let i = 0; i < this.nodeCount; i++) this.iter[i] = this.head[i];
      let pushed = this.dfs(source, sink, upperBound - total);
      while (pushed > 0) { total += pushed; if (total >= upperBound) break; pushed = this.dfs(source, sink, upperBound - total); }
    }
    return total;
  }

  /**
   * الجانب المنبعي من الحاجز الأدنى: العُقَد التي ما زالت تُبلَغ من المنبع في الشبكة
   * المتبقية بعد التشبّع. وهو شاهد ماكس-فلو/مِن-كت: ما عبر الحاجز هو كل ما أمكن عبوره.
   */
  minCutSourceSide(source: number): Uint8Array {
    const seen = new Uint8Array(this.nodeCount);
    const queue = new Int32Array(this.nodeCount);
    let qh = 0, qt = 0;
    seen[source] = 1; queue[qt++] = source;
    while (qh < qt) {
      const node = queue[qh++];
      for (let e = this.head[node]; e !== -1; e = this.edgeNext[e]) {
        const next = this.edgeTo[e];
        if (this.edgeCap[e] > 0 && !seen[next]) { seen[next] = 1; queue[qt++] = next; }
      }
    }
    return seen;
  }

  /**
   * أقلّ تكلفة لأكبر تدفّق — الطريقة الأوّلية-الثنوية (primal–dual).
   *
   * دَيْكسترا بالجهود يحسب أقصر مسافة، ثم يُدفع **تدفّقٌ ساد** على كل المسارات القصيرة
   * دفعةً واحدة لا على مسارٍ واحد. والفرق عمليّ لا نظري: مسألةٌ بألف ومئتي وحدة تدفّق
   * كانت تحتاج ألفًا ومئتي دورة دَيْكسترا، فصارت تحتاج عددًا يساوي عدد الأطوال المختلفة
   * لأقصر المسارات — وهو أصغر بمراتب.
   *
   * والصواب محفوظ: الأقواس المقبولة هي ما كانت تكلفتها المخفَّضة صفرًا، فكل ما يُدفع
   * عليها يبقى على أقصر مسار. والمستويات تمنع الدوران في دوائر صفرية التكلفة.
   */
  minCostMaxFlow(source: number, sink: number, options?: { maxIterations?: number; flowLimit?: number }): MinCostResult {
    const n = this.nodeCount;
    const potential = new Float64Array(n);
    const dist = new Float64Array(n);
    const maxIterations = options?.maxIterations ?? 200000;
    const flowLimit = options?.flowLimit ?? Number.POSITIVE_INFINITY;
    let flow = 0, iterations = 0;
    const heap = new BinaryHeap(n);
    const queue = new Int32Array(n);

    const reduced = (edge: number, from: number) => this.edgeCost[edge] + potential[from] - potential[this.edgeTo[edge]];

    while (flow < flowLimit) {
      if (iterations >= maxIterations) return { flow, cost: this.totalCost(), proven: false, iterations };
      iterations++;

      dist.fill(Number.POSITIVE_INFINITY);
      dist[source] = 0;
      heap.clear();
      heap.push(source, 0);
      while (heap.size) {
        const { node, key } = heap.pop();
        if (key > dist[node] + 1e-12) continue;
        for (let e = this.head[node]; e !== -1; e = this.edgeNext[e]) {
          if (this.edgeCap[e] <= 0) continue;
          const next = this.edgeTo[e];
          const candidate = dist[node] + reduced(e, node);
          if (candidate < dist[next] - 1e-9) { dist[next] = candidate; heap.push(next, candidate); }
        }
      }
      if (!Number.isFinite(dist[sink])) break;
      for (let i = 0; i < n; i++) if (Number.isFinite(dist[i])) potential[i] += dist[i];

      // مستويات على الشبكة الجزئية المقبولة (تكلفة مخفَّضة صفرية)، ثم تدفّق ساد عليها.
      let pushedTotal = 0;
      for (;;) {
        this.level.fill(-1);
        let qh = 0, qt = 0;
        this.level[source] = 0; queue[qt++] = source;
        while (qh < qt) {
          const node = queue[qh++];
          for (let e = this.head[node]; e !== -1; e = this.edgeNext[e]) {
            const next = this.edgeTo[e];
            if (this.edgeCap[e] > 0 && this.level[next] < 0 && Math.abs(reduced(e, node)) < 1e-9) { this.level[next] = this.level[node] + 1; queue[qt++] = next; }
          }
        }
        if (this.level[sink] < 0) break;
        for (let i = 0; i < n; i++) this.iter[i] = this.head[i];
        let pushed = this.dfsAdmissible(source, sink, flowLimit - flow - pushedTotal, potential);
        while (pushed > 0) {
          pushedTotal += pushed;
          if (flow + pushedTotal >= flowLimit) break;
          pushed = this.dfsAdmissible(source, sink, flowLimit - flow - pushedTotal, potential);
        }
        if (flow + pushedTotal >= flowLimit) break;
      }
      if (pushedTotal <= 0) break;
      flow += pushedTotal;
    }
    return { flow, cost: this.totalCost(), proven: true, iterations };
  }

  /** بحثٌ عميق على الأقواس المقبولة وحدها — نظير دِنِتش داخل الشبكة الجزئية صفرية التكلفة. */
  private dfsAdmissible(node: number, sink: number, limit: number, potential: Float64Array): number {
    if (node === sink || limit <= 0) return limit > 0 ? limit : 0;
    for (; this.iter[node] !== -1; this.iter[node] = this.edgeNext[this.iter[node]]) {
      const e = this.iter[node];
      const next = this.edgeTo[e];
      if (this.edgeCap[e] <= 0 || this.level[next] !== this.level[node] + 1) continue;
      if (Math.abs(this.edgeCost[e] + potential[node] - potential[next]) >= 1e-9) continue;
      const pushed = this.dfsAdmissible(next, sink, Math.min(limit, this.edgeCap[e]), potential);
      if (pushed > 0) { this.edgeCap[e] -= pushed; this.edgeCap[e ^ 1] += pushed; return pushed; }
    }
    return 0;
  }

  /** التكلفة الجارية = مجموع (تدفّق القوس الأمامي × تكلفته). تُحسب من الحالة لا تُتراكم. */
  totalCost(): number {
    let cost = 0;
    for (let i = 0; i < this.edgeCount; i += 2) cost += this.edgeCap[i + 1] * this.edgeCost[i];
    return cost;
  }
}

/** كومة ثنائية صغيرة بمصفوفات — أسرع من فرز مصفوفة في كل دورة دَيْكسترا. */
class BinaryHeap {
  private nodes: Int32Array;
  private keys: Float64Array;
  size = 0;
  constructor(capacity: number) { this.nodes = new Int32Array(capacity + 1); this.keys = new Float64Array(capacity + 1); }
  clear() { this.size = 0; }
  private grow() {
    if (this.size + 1 < this.nodes.length) return;
    const size = this.nodes.length * 2;
    const nodes = new Int32Array(size); nodes.set(this.nodes); this.nodes = nodes;
    const keys = new Float64Array(size); keys.set(this.keys); this.keys = keys;
  }
  push(node: number, key: number) {
    this.grow();
    let i = this.size++;
    this.nodes[i] = node; this.keys[i] = key;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      this.swap(parent, i); i = parent;
    }
  }
  pop(): { node: number; key: number } {
    const node = this.nodes[0], key = this.keys[0];
    this.size--;
    if (this.size > 0) {
      this.nodes[0] = this.nodes[this.size]; this.keys[0] = this.keys[this.size];
      let i = 0;
      for (;;) {
        const left = i * 2 + 1, right = left + 1;
        let best = i;
        if (left < this.size && this.keys[left] < this.keys[best]) best = left;
        if (right < this.size && this.keys[right] < this.keys[best]) best = right;
        if (best === i) break;
        this.swap(best, i); i = best;
      }
    }
    return { node, key };
  }
  private swap(a: number, b: number) {
    const node = this.nodes[a]; this.nodes[a] = this.nodes[b]; this.nodes[b] = node;
    const key = this.keys[a]; this.keys[a] = this.keys[b]; this.keys[b] = key;
  }
}
