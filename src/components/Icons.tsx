import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

type IconProps = {
  color?: string;
  size?: number;
  strokeWidth?: number;
};

export const UserIcon = ({ color = '#FFF', size = 24, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="8" r="4" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M4 21C4 16.5817 7.58172 13 12 13C16.4183 13 20 16.5817 20 21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const MailIcon = ({ color = '#FFF', size = 24, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="2" y="4" width="20" height="16" rx="3" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M2 7L10.5 13.5C11.3856 14.2333 12.6144 14.2333 13.5 13.5L22 7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const EditIcon = ({ color = '#FFF', size = 20, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M15.232 5.232L18.768 8.768M16.732 3.732C17.708 2.756 19.292 2.756 20.268 3.732C21.244 4.708 21.244 6.292 20.268 7.268L7.5 20.036L3 21L3.964 16.5L16.732 3.732Z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const TrashIcon = ({ color = '#FFF', size = 20, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 6H21M8 6V4C8 2.89543 8.89543 2 10 2H14C15.1046 2 16 2.89543 16 4V6M19 6V20C19 21.1046 18.1046 22 17 22H7C5.89543 22 5 21.1046 5 20V6H19Z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M10 11V17M14 11V17" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const TrophyIcon = ({ color = '#FFF', size = 24, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M8 21H16M12 17V21M7 4H17V12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12V4Z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M7 6H4C2.89543 6 2 6.89543 2 8V10C2 11.1046 2.89543 12 4 12H7" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <Path d="M17 6H20C21.1046 6 22 6.89543 22 8V10C22 11.1046 21.1046 12 20 12H17" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const UsersIcon = ({ color = '#FFF', size = 24, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="9" cy="8" r="4" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M3 21C3 16.5817 5.68629 13 9 13C12.3137 13 15 16.5817 15 21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <Path d="M16 13C18.7614 13 21 15.2386 21 18V21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <Path d="M15 4.5C16.6569 4.5 18 5.84315 18 7.5C18 9.15685 16.6569 10.5 15 10.5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const WatchIcon = ({ color = '#FFF', size = 24, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="6" y="6" width="12" height="12" rx="3" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M9 6V2H15V6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <Path d="M9 18V22H15V18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <Path d="M12 9V12L14 14" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
  </Svg>
);

export const BellIcon = ({ color = '#FFF', size = 24, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M18 8C18 4.68629 15.3137 2 12 2C8.68629 2 6 4.68629 6 8C6 15 3 17 3 17H21C21 17 18 15 18 8Z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M13.73 21C13.5542 21.3031 13.3019 21.5547 12.9982 21.7295C12.6946 21.9044 12.3504 21.9965 12 21.9965C11.6496 21.9965 11.3054 21.9044 11.0018 21.7295C10.6982 21.5547 10.4458 21.3031 10.27 21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const SettingsIcon = ({ color = '#FFF', size = 24, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M19.4 15A1.65 1.65 0 0 0 19.26 14.12L20.14 13.24C20.7295 12.6505 20.7295 11.6895 20.14 11.1L18.36 9.32C17.7745 8.7305 16.8085 8.7305 16.22 9.32L15.34 10.2C15.0404 10.0172 14.7249 9.8663 14.4 9.75V8.5C14.4 7.67157 13.7284 7 12.9 7H12.1C11.2716 7 10.6 7.67157 10.6 8.5V9.72C10.2751 9.8363 9.95959 9.9872 9.66 10.17L8.78 9.29C8.1945 8.7005 7.2285 8.7005 6.64 9.29L4.86 11.07C4.2705 11.6595 4.2705 12.6205 4.86 13.21L5.74 14.09C5.5572 14.3896 5.4063 14.7051 5.29 15.03H4.07C3.24157 15.03 2.57 15.7016 2.57 16.53V17.33C2.57 18.1584 3.24157 18.83 4.07 18.83H5.29C5.4063 19.1549 5.5572 19.4704 5.74 19.77L4.86 20.65C4.2705 21.2395 4.2705 22.2005 4.86 22.79L6.64 24.57C7.2285 25.1595 8.1945 25.1595 8.78 24.57L9.66 23.69C9.95959 23.8728 10.2751 24.0237 10.6 24.14V25.36C10.6 26.1884 11.2716 26.86 12.1 26.86H12.9C13.7284 26.86 14.4 26.1884 14.4 25.36V24.14C14.7249 24.0237 15.0404 23.8728 15.34 23.69L16.22 24.57C16.8085 25.1595 17.7745 25.1595 18.36 24.57L20.14 22.79C20.7295 22.2005 20.7295 21.2395 20.14 20.65L19.26 19.77C19.4428 19.4704 19.5937 19.1549 19.71 18.83H20.93C21.7584 18.83 22.43 18.1584 22.43 17.33V16.53C22.43 15.7016 21.7584 15.03 20.93 15.03H19.71C19.5937 14.7051 19.4428 14.3896 19.26 14.09L19.4 15Z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const LockIcon = ({ color = '#FFF', size = 24, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x="5" y="11" width="14" height="11" rx="2" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V11" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <Circle cx="12" cy="16" r="1.5" fill={color} />
  </Svg>
);

export const ChevronRightIcon = ({ color = '#FFF', size = 24, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 6L15 12L9 18" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const AlertCircleIcon = ({ color = '#FFF', size = 24, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeWidth} />
    <Path d="M12 8V12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    <Circle cx="12" cy="16" r="1" fill={color} />
  </Svg>
);

export const HeartIcon = ({ color = '#FFF', size = 24, strokeWidth = 2, fill = 'none' }: IconProps & { fill?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
    <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const CommentIcon = ({ color = '#FFF', size = 24, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ShareIcon = ({ color = '#FFF', size = 24, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 12V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V12" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M16 6L12 2L8 6" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M12 2V15" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const SendIcon = ({ color = '#FFF', size = 24, strokeWidth = 2 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M22 2L11 13" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M22 2L15 22L11 13L2 9L22 2Z" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);