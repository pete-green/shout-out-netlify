import styles from './Avatar.module.css';

interface AvatarProps {
  src?: string;
  alt?: string;
  initials?: string;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export function Avatar({
  src,
  alt = '',
  initials,
  size = 'medium',
  className = ''
}: AvatarProps) {
  const sizeClass = styles[size];

  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={`${styles.avatar} ${sizeClass} ${className}`.trim()}
      />
    );
  }

  if (initials) {
    return (
      <div className={`${styles.avatar} ${styles.initials} ${sizeClass} ${className}`.trim()}>
        {initials}
      </div>
    );
  }

  return null;
}
