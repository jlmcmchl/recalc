import {
  Bore,
  ChainType,
  FRCVendor,
  MotorBores,
  PulleyBeltType,
} from "common/models/ExtraTypes";
import { MeasurementDict } from "common/models/Measurement";
import { min } from "lodash";
import max from "lodash/max";

export type DrivingDriven = { driving: MotionMethod[]; driven: MotionMethod[] };

type BaseMotionMethod = {
  teeth: number;
  bore: Bore;
  vendor: FRCVendor;
  url: string;
  partNumber: string;
};

export type PulleyData = BaseMotionMethod & {
  beltType: PulleyBeltType;
  pitch: MeasurementDict;
};

export type SprocketData = BaseMotionMethod & {
  chainType: ChainType;
};

export type GearData = BaseMotionMethod & {
  dp: number;
};

export type MotionMethodPart = "Gear" | "Pulley" | "Sprocket";
export type MotionMethod = BaseMotionMethod & {
  type: MotionMethodPart;
};

export function MMTypeStr(mm: MotionMethod): string {
  let typeStr = "";
  if (mm.type === "Gear") {
    typeStr = `${(mm as any as GearData).dp} DP`;
  } else if (mm.type === "Pulley") {
    typeStr = (mm as any as PulleyData).beltType;
  } else if (mm.type === "Sprocket") {
    typeStr = (mm as any as SprocketData).chainType;
  }
  return typeStr;
}

export class Stage2 {
  constructor(
    public readonly driving: number,
    public readonly driven: number,
    public drivingMethods: MotionMethod[],
    public drivenMethods: MotionMethod[]
  ) {}

  getRatio(): number {
    return this.driven / max([1, this.driving])!;
  }

  getMax(): number {
    return this.driven > this.driving ? this.driven : this.driving;
  }

  getMin(): number {
    return this.driven < this.driving ? this.driven : this.driving;
  }
}

export class Gearbox2 {
  constructor(public stages: Stage2[]) {}

  addStage(stage: Stage2) {
    this.stages.push(stage);
  }

  getRatio(): number {
    return this.stages.reduce((prev, curr) => prev * curr.getRatio(), 1);
  }

  getStages(): number {
    return this.stages.length;
  }

  getMax(): number {
    return max(this.stages.map((s) => s.getMax())) || 1000;
  }

  getMin(): number {
    return min(this.stages.map((s) => s.getMin())) || 0;
  }

  containsPinionInGoodPlace(): boolean {
    return (
      this.stages[0].drivingMethods.filter((m) => MotorBores.includes(m.bore))
        .length > 0
    );
  }

  containsPinionInBadPlace(): boolean {
    if (this.stages.length === 1) {
      return (
        this.stages[0].drivenMethods.filter((m) => !MotorBores.includes(m.bore))
          .length === 0
      );
    }

    for (let i = 1; i < this.stages.length; i++) {
      let nonPinions = this.stages[i].drivingMethods.filter(
        (m) => !MotorBores.includes(m.bore)
      );

      // console.log(i, this.stages[i]);
      if (
        nonPinions.length === 0 ||
        this.stages[i].drivenMethods.filter((m) => !MotorBores.includes(m.bore))
          .length === 0
      ) {
        return true;
      }
    }

    return false;
  }

  filterStagesForOverlappingMotionMethods() {
    this.stages.forEach((stage) => {
      let newDriven: MotionMethod[] = [];
      let newDriving: MotionMethod[] = [];

      stage.drivingMethods.forEach((driving) => {
        const matchingMethod = stage.drivenMethods.filter(
          (driven) =>
            driving.type === driven.type &&
            MMTypeStr(driving) === MMTypeStr(driven)
        );

        if (matchingMethod.length > 0) {
          newDriving.push(driving);

          matchingMethod.forEach((match) => {
            if (!newDriven.includes(match)) {
              newDriven.push(match);
            }
          });
        }
      });

      stage.drivingMethods = newDriving;
      stage.drivenMethods = newDriven;
    });
  }

  filterStagesForOverlappingBores() {
    for (let i = 0; i < this.stages.length - 1; i++) {
      let prevStage = this.stages[i];
      let nextStage = this.stages[i + 1];
      let newPrevDriven: MotionMethod[] = [];
      let newNextDriving: MotionMethod[] = [];

      prevStage.drivenMethods.forEach((driven) => {
        const matchingBores = nextStage.drivingMethods.filter(
          (driving) => driving.bore === driven.bore
        );

        if (matchingBores.length > 0) {
          newPrevDriven.push(driven);

          matchingBores.forEach((matching) => {
            if (!newNextDriving.includes(matching)) {
              newNextDriving.push(matching);
            }
          });
        }
      });

      prevStage.drivenMethods = newPrevDriven;
      nextStage.drivingMethods = newNextDriving;
    }
  }

  hasMotionModes(): boolean {
    let good = true;
    this.stages.forEach((stage) => {
      if (
        stage.drivenMethods.length === 0 ||
        stage.drivingMethods.length === 0
      ) {
        good = false;
      }
    });

    return good;
  }

  toObj(): {
    driven: number;
    driving: number;
    drivingMethods: MotionMethod[];
    drivenMethods: MotionMethod[];
  }[] {
    return this.stages.map((s) => ({
      driven: s.driven,
      driving: s.driving,
      drivingMethods: s.drivingMethods,
      drivenMethods: s.drivenMethods,
    }));
  }

  static fromObj(
    obj: {
      driven: number;
      driving: number;
      drivingMethods: MotionMethod[];
      drivenMethods: MotionMethod[];
    }[]
  ) {
    return new Gearbox2(
      obj.map(
        (o) =>
          new Stage2(o.driving, o.driven, o.drivingMethods, o.drivenMethods)
      )
    );
  }

  compare(gb: Gearbox2, targetReduction: number): number {
    const error = Math.abs(this.getRatio() - targetReduction);
    const otherError = Math.abs(gb.getRatio() - targetReduction);

    return (
      error - otherError ||
      this.getStages() - gb.getStages() ||
      this.getMax() - gb.getMax() ||
      this.getMin() - gb.getMin()
    );
  }
}
