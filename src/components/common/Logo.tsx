/**
 * Nexus Logo Component
 * Reusable logo component that matches the favicon design
 */

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showShadow?: boolean;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
  xl: 'w-20 h-20',
};

export default function Logo({ size = 'md', className = '', showShadow = false }: LogoProps) {
  const sizeClass = sizeClasses[size];
  const shadowClass = showShadow ? 'shadow-lg' : '';

  return (
    <div className={`${sizeClass} rounded-2xl overflow-hidden ${shadowClass} ${className}`}>
      <img 
        src="/nexus-icon.png" 
        alt="Nexus Logo" 
        className="w-full h-full object-contain"
      />
    </div>
  );
}

