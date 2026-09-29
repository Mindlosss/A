import {
  Baby,
  CarFront,
  Coffee,
  Dumbbell,
  Film,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  MoreHorizontal,
  PawPrint,
  PiggyBank,
  Plane,
  Shirt,
  ShoppingBag,
  Smartphone,
  UtensilsCrossed,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { IconName } from "./data";

export const categoryIcons: Record<IconName, LucideIcon> = {
  utensils: UtensilsCrossed,
  car: CarFront,
  house: Home,
  bag: ShoppingBag,
  heart: HeartPulse,
  grid: MoreHorizontal,
  coffee: Coffee,
  plane: Plane,
  game: Gamepad2,
  gift: Gift,
  school: GraduationCap,
  gym: Dumbbell,
  pet: PawPrint,
  shirt: Shirt,
  phone: Smartphone,
  bolt: Zap,
  film: Film,
  baby: Baby,
  tool: Wrench,
  piggy: PiggyBank,
};

export function CategoryIcon({ icon, size = 17 }: { icon: IconName; size?: number }) {
  const Icon = categoryIcons[icon] ?? MoreHorizontal;
  return <Icon size={size} strokeWidth={1.8} />;
}
