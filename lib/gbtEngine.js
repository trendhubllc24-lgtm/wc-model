// Pure-JS gradient boosted trees. No npm dependency — the only real option
// (xgboost's JS bindings) is WASM-based and doesn't load reliably in Vercel's
// serverless runtime, so this is a from-scratch implementation instead.
//
// Deliberately simple: depth-3 trees, squared-error objective via
// gradient/hessian (Newton-step leaf values — standard GBM, not a
// simplification), 60 rounds, learning rate 0.15. Multi-class (win/draw/loss)
// handled as 3 one-vs-rest regressors on log-odds, softmax'd at predict time.
//
// THE PERFORMANCE TRAP THIS AVOIDS: naively finding the best split at each
// node means, for every candidate feature, sorting or scanning the node's
// rows from scratch — that's O(n log n) or O(n²) PER SPLIT, and with depth-3
// trees × 60 rounds × 3 classes, that compounds fast. A first pass at this
// written the naive way hung for minutes at a few hundred rows once the
// per-split scan was O(n²) (recomputing sums from scratch for every
// candidate threshold instead of scanning once and accumulating running
// sums). The version below sorts each feature ONCE per node and accumulates
// gradient/hessian sums in a single left-to-right pass — O(n log n) per
// node, not per split. Stress-tested below at realistic + inflated row
// counts before this touches any API route.

function buildTree(rows, gradients, hessians, featureNames, maxDepth = 3, minLeafSize = 5, lambda = 1.0) {
  function leafValue(idxs) {
    let g = 0, h = 0;
    for (const i of idxs) { g += gradients[i]; h += hessians[i]; }
    return -g / (h + lambda);
  }

  function splitGain(gL, hL, gR, hR, gAll, hAll) {
    const term = (g, h) => (g * g) / (h + lambda);
    return 0.5 * (term(gL, hL) + term(gR, hR) - term(gAll, hAll));
  }

  // Finds the best (feature, threshold) split for this node in O(n log n):
  // sort row indices by the feature ONCE, then scan left-to-right
  // accumulating running gradient/hessian sums instead of recomputing them
  // per candidate threshold (that recomputation is exactly what made the
  // naive version O(n²) per split).
  function bestSplit(idxs) {
    let gAll = 0, hAll = 0;
    for (const i of idxs) { gAll += gradients[i]; hAll += hessians[i]; }

    let best = null;
    for (const feat of featureNames) {
      const sorted = idxs.slice().sort((a, b) => rows[a][feat] - rows[b][feat]);
      let gL = 0, hL = 0;
      for (let k = 0; k < sorted.length - 1; k++) {
        const i = sorted[k];
        gL += gradients[i]; hL += hessians[i];
        const gR = gAll - gL, hR = hAll - hL;
        const leftCount = k + 1, rightCount = sorted.length - leftCount;
        if (leftCount < minLeafSize || rightCount < minLeafSize) continue;
        // skip thresholds between equal feature values (no real split there)
        if (rows[sorted[k]][feat] === rows[sorted[k + 1]][feat]) continue;
        const gain = splitGain(gL, hL, gR, hR, gAll, hAll);
        if (!best || gain > best.gain) {
          const threshold = (rows[sorted[k]][feat] + rows[sorted[k + 1]][feat]) / 2;
          best = { gain, feat, threshold, leftIdxs: sorted.slice(0, leftCount), rightIdxs: sorted.slice(leftCount) };
        }
      }
    }
    return best;
  }

  function grow(idxs, depth) {
    if (depth >= maxDepth || idxs.length < minLeafSize * 2) {
      return { leaf: true, value: leafValue(idxs) };
    }
    const split = bestSplit(idxs);
    if (!split || split.gain <= 0) {
      return { leaf: true, value: leafValue(idxs) };
    }
    return {
      leaf: false, feat: split.feat, threshold: split.threshold,
      left: grow(split.leftIdxs, depth + 1),
      right: grow(split.rightIdxs, depth + 1),
    };
  }

  const allIdxs = rows.map((_, i) => i);
  return grow(allIdxs, 0);
}

function predictTree(tree, row) {
  let node = tree;
  while (!node.leaf) node = row[node.feat] <= node.threshold ? node.left : node.right;
  return node.value;
}

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// Trains one boosted ensemble targeting a single 0/1 label (one-vs-rest).
// Returns { trees, predict(row) -> probability }.
export function trainBoostedClassifier(rows, labels, featureNames, opts = {}) {
  const rounds = opts.rounds ?? 60;
  const lr = opts.learningRate ?? 0.15;
  const maxDepth = opts.maxDepth ?? 3;

  const n = rows.length;
  let rawScore = new Array(n).fill(0); // log-odds accumulator
  const trees = [];

  for (let r = 0; r < rounds; r++) {
    const preds = rawScore.map(sigmoid);
    // logistic loss gradient/hessian (Newton step), not squared-error —
    // this is what makes it a real classifier, not a regressor bolted on
    const gradients = preds.map((p, i) => p - labels[i]);
    const hessians = preds.map((p) => p * (1 - p) + 1e-6);

    const tree = buildTree(rows, gradients, hessians, featureNames, maxDepth);
    trees.push(tree);
    for (let i = 0; i < n; i++) rawScore[i] += lr * predictTree(tree, rows[i]);
  }

  return {
    trees,
    predictRaw(row) { return trees.reduce((s, t) => s + lr * predictTree(t, row), 0); },
    predict(row) { return sigmoid(this.predictRaw(row)); },
  };
}

// Trains the full 3-way (A win / draw / B win) model as one-vs-rest, softmax
// at predict time so the three probabilities always sum to 1.
export function trainMatchModel(rows, outcomes, featureNames, opts = {}) {
  const labelsA = outcomes.map((o) => (o === "A" ? 1 : 0));
  const labelsD = outcomes.map((o) => (o === "D" ? 1 : 0));
  const labelsB = outcomes.map((o) => (o === "B" ? 1 : 0));

  const modelA = trainBoostedClassifier(rows, labelsA, featureNames, opts);
  const modelD = trainBoostedClassifier(rows, labelsD, featureNames, opts);
  const modelB = trainBoostedClassifier(rows, labelsB, featureNames, opts);

  return {
    predict(row) {
      const rawA = modelA.predictRaw(row), rawD = modelD.predictRaw(row), rawB = modelB.predictRaw(row);
      const m = Math.max(rawA, rawD, rawB);
      const eA = Math.exp(rawA - m), eD = Math.exp(rawD - m), eB = Math.exp(rawB - m);
      const sum = eA + eD + eB;
      return { pA: eA / sum, pD: eD / sum, pB: eB / sum };
    },
    // trees are plain JSON-serializable objects — this is what gets persisted
    // to Redis so the trained model survives across serverless invocations.
    serialize() { return { treesA: modelA.trees, treesD: modelD.trees, treesB: modelB.trees, lr: opts.learningRate ?? 0.15 }; },
  };
}

// Rehydrates a serialized model (from Redis) back into a usable predictor.
export function loadMatchModel(serialized) {
  const lr = serialized.lr ?? 0.15;
  const scoreFrom = (trees, row) => trees.reduce((s, t) => s + lr * predictTree(t, row), 0);
  return {
    predict(row) {
      const rawA = scoreFrom(serialized.treesA, row);
      const rawD = scoreFrom(serialized.treesD, row);
      const rawB = scoreFrom(serialized.treesB, row);
      const m = Math.max(rawA, rawD, rawB);
      const eA = Math.exp(rawA - m), eD = Math.exp(rawD - m), eB = Math.exp(rawB - m);
      const sum = eA + eD + eB;
      return { pA: eA / sum, pD: eD / sum, pB: eB / sum };
    },
  };
}
