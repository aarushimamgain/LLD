import { Dimension, assertOneOf } from './enums.js';

/** Score for one dimension: `earned / possible` rule points, scaled to the dimension's weight. */
export class DimensionScore {
  constructor({ dimension, earned, possible, weight }) {
    assertOneOf(dimension, Dimension, 'dimension');
    if (!(possible >= 0) || !(earned >= 0) || earned > possible) {
      throw new Error(`Invalid points for ${dimension}: ${earned}/${possible}`);
    }
    if (!(weight >= 0)) throw new Error(`Invalid weight for ${dimension}: ${weight}`);

    this.dimension = dimension;
    this.earned = earned;
    this.possible = possible;
    this.weight = weight;
    Object.freeze(this);
  }

  /** Nothing to check means nothing was missed, so an empty dimension scores full marks. */
  get ratio() {
    return this.possible === 0 ? 1 : this.earned / this.possible;
  }

  get score() {
    return roundToTenth(this.ratio * this.weight);
  }

  toJSON() {
    const { dimension, earned, possible, weight, score } = this;
    return { dimension, earned, possible, weight, score };
  }

  static fromJSON({ dimension, earned, possible, weight }) {
    return new DimensionScore({ dimension, earned, possible, weight });
  }
}

export function roundToTenth(value) {
  return Math.round(value * 10) / 10;
}
