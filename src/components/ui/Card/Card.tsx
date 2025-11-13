import { ReactNode, CSSProperties } from 'react';
import styles from './Card.module.css';

interface CardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  borderColor?: string;
  hoverable?: boolean;
}

export function Card({
  children,
  className = '',
  style = {},
  onClick,
  borderColor,
  hoverable = false
}: CardProps) {
  const cardStyle: CSSProperties = {
    ...style,
    ...(borderColor && { borderColor }),
  };

  const cardClassName = `${styles.card} ${hoverable ? styles.hoverable : ''} ${className}`.trim();

  return (
    <div
      className={cardClassName}
      style={cardStyle}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
