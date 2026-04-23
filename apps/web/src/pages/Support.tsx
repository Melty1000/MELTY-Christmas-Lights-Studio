import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import clsx from 'clsx';
import {
  Activity,
  Brain,
  Coffee,
  Gift,
  Github,
  Globe,
  Heart,
  Instagram,
  List,
  MessageSquare,
  ShoppingBag,
  Twitch,
  Users,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { SocialLink } from '~/components/support/SocialLink.tsx';

// ---------------------------------------------------------------------------
// Brand icons (ported from melty.lol)
// ---------------------------------------------------------------------------

type IconProps = React.SVGProps<SVGSVGElement> & { size?: number };
type SocialIcon = React.ComponentType<IconProps>;

function wrapLucide(Icon: LucideIcon): SocialIcon {
  return function WrappedLucide(props: IconProps) {
    const { size, width, height, ...rest } = props;
    const dimension = size ?? width ?? height ?? 14;
    return <Icon width={dimension} height={dimension} {...rest} />;
  };
}

const ICO_COFFEE = wrapLucide(Coffee);
const ICO_GITHUB = wrapLucide(Github);
const ICO_GLOBE = wrapLucide(Globe);
const ICO_TWITCH = wrapLucide(Twitch);
const ICO_YOUTUBE = wrapLucide(Youtube);
const ICO_INSTAGRAM = wrapLucide(Instagram);
const ICO_SHOPBAG = wrapLucide(ShoppingBag);
const ICO_GIFT = wrapLucide(Gift);

function svgDim(props: IconProps, fallback: number): number {
  return (props.size ?? props.width ?? props.height ?? fallback) as number;
}

const DiscordIcon: SocialIcon = (props) => {
  const d = svgDim(props, 20);
  return (
    <svg viewBox="0 0 127.14 96.36" fill="currentColor" width={d} height={d} {...props}>
      <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.71,32.65-1.82,56.6.48,80.1a105.73,105.73,0,0,0,32.2,16.26,77.7,77.7,0,0,0,7.34-11.94,64.4,64.4,0,0,1-11.72-5.67q1.11-.84,2.2-1.72a71.7,71.7,0,0,0,65.65,0q1.11.89,2.2,1.72a64.41,64.41,0,0,1-11.72,5.67,77.66,77.66,0,0,0,7.34,11.94,105.75,105.75,0,0,0,32.21-16.26C129.58,50.7,125.1,26.83,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
    </svg>
  );
};

const XIcon: SocialIcon = (props) => {
  const d = svgDim(props, 20);
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={d} height={d} {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.451-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
};

const BlueSkyIcon: SocialIcon = (props) => {
  const d = svgDim(props, 14);
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" width={d} height={d} {...props}>
      <path d="M3.468 1.948C5.303 3.325 7.276 6.118 8 7.616c.725-1.498 2.698-4.29 4.532-5.668C13.855.955 16 .186 16 2.632c0 .489-.28 4.105-.444 4.692-.572 2.04-2.653 2.561-4.504 2.246 3.236.551 4.06 2.375 2.281 4.2-3.376 3.464-4.852-.87-5.23-1.98-.07-.204-.103-.3-.103-.218 0-.081-.033.014-.102.218-.379 1.11-1.855 5.444-5.231 1.98-1.778-1.825-.955-3.65 2.28-4.2-1.85.315-3.932-.205-4.503-2.246C.28 6.737 0 3.12 0 2.632 0 .186 2.145.955 3.468 1.948" />
    </svg>
  );
};

const PatreonIcon: SocialIcon = (props) => {
  const d = svgDim(props, 14);
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={d} height={d} {...props}>
      <path d="M0 .48v23.04h4.22V.48zm15.385 0c-4.764 0-8.641 3.88-8.641 8.65 0 4.755 3.877 8.636 8.641 8.636 4.75 0 8.615-3.881 8.615-8.636 0-4.77-3.865-8.65-8.615-8.65z" />
    </svg>
  );
};

const SpotifyIcon: SocialIcon = (props) => {
  const d = svgDim(props, 14);
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={d} height={d} {...props}>
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.49 17.3c-.21.34-.65.45-.99.24-2.81-1.72-6.35-2.11-10.51-1.16-.39.09-.78-.16-.87-.55-.09-.39.16-.78.55-.87 4.56-1.04 8.46-.58 11.59 1.35.33.2.44.64.23.99zm1.46-3.26c-.26.43-.82.56-1.25.3-3.22-1.98-8.12-2.55-11.93-1.4-.49.15-.99-.13-1.14-.62-.15-.49.13-.99.62-1.14 4.36-1.32 9.77-.67 13.4 1.56.43.26.56.82.3 1.25zm.14-3.41c-3.85-2.29-10.21-2.5-13.91-1.38-.59.18-1.21-.16-1.39-.75-.18-.59.16-1.21.75-1.39 4.25-1.29 11.28-1.04 15.71 1.59.53.31.71 1 .4 1.53-.31.53-1 .71-1.53.4z" />
    </svg>
  );
};

const PayPalIcon: SocialIcon = (props) => {
  const d = svgDim(props, 14);
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={d} height={d} {...props}>
      <path d="M20.067 8.178c-.532 5.311-4.088 7.683-9.15 7.683H8.381l-1.34 6.74H2.433L5.4 3.01h7.828c3.085 0 5.483.744 6.309 2.548.243.532.378 1.137.378 1.769 0 .307-.023.606-.067.892z" />
    </svg>
  );
};

const ThreadsIcon: SocialIcon = (props) => {
  const d = svgDim(props, 14);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={d}
      height={d}
      {...props}
    >
      <path d="M19 7.5c-1.333 -3 -3.667 -4.5 -7 -4.5c-5 0 -8 2.5 -8 9s3.5 9 8 9s7 -3 7 -5s-1 -5 -7 -5c-2.5 0 -3 1.25 -3 2.5c0 1.5 1 2.5 2.5 2.5c2.5 0 3.5 -1.5 3.5 -5s-2 -4 -3 -4s-1.833 .333 -2.5 1" />
    </svg>
  );
};

const TikTokIcon: SocialIcon = (props) => {
  const d = svgDim(props, 14);
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={d} height={d} {...props}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
    </svg>
  );
};

const FacebookIcon: SocialIcon = (props) => {
  const d = svgDim(props, 14);
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={d} height={d} {...props}>
      <path d="M24 12.073C24 5.445 18.627 0 12 0S0 5.445 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.953h-1.514c-1.491 0-1.956.93-1.956 1.883v2.285h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
    </svg>
  );
};

const KickIcon: SocialIcon = (props) => {
  const d = svgDim(props, 14);
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={d} height={d} {...props}>
      <path d="M4 2v20h4v-8l8 8h5L12 12l9-10h-5L8 10V2z" />
    </svg>
  );
};

const CodePenIcon: SocialIcon = (props) => {
  const d = svgDim(props, 14);
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={d}
      height={d}
      {...props}
    >
      <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
      <line x1="12" y1="22" x2="12" y2="15.5" />
      <polyline points="22 8.5 12 15.5 2 8.5" />
      <polyline points="2 15.5 12 8.5 22 15.5" />
      <line x1="12" y1="2" x2="12" y2="8.5" />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface SocialEntry {
  icon: SocialIcon;
  href: string;
  color: string;
}

interface PersonData {
  name: string;
  logo: string;
  desc: string;
  twitchHandle?: string;
  socials: SocialEntry[];
}

const INSPIRATIONS: PersonData[] = [
  {
    name: 'Tawmae',
    twitchHandle: 'tawmae',
    logo: 'https://github.com/tawmae.png',
    desc: 'I cannot glaze this man enough. He is the reason i started building tools for Streamer.bot. Every single utility that he puts out is incredible and top notch. My entire style is 100% inspired by him. And though he doesnt know it, I could never thank him enough for what he has done for this entire community. If there is one person to check out from this list, I cannot suggest him enough.',
    socials: [
      { icon: ICO_GLOBE, href: 'https://tawmae.xyz/', color: '#3b82f6' },
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/tawmae', color: '#9146FF' },
      { icon: ICO_YOUTUBE, href: 'https://www.youtube.com/@tawmae', color: '#FF0000' },
      { icon: XIcon, href: 'https://x.com/tawmaeXYZ', color: '#1DA1F2' },
      { icon: BlueSkyIcon, href: 'https://bsky.app/profile/tawmae.xyz', color: '#0085ff' },
      { icon: DiscordIcon, href: 'https://discord.com/invite/gEm5UMSvYs', color: '#5865F2' },
      { icon: ICO_GITHUB, href: 'https://github.com/tawmae', color: '#6e5494' },
      { icon: ICO_COFFEE, href: 'https://ko-fi.com/tawmae', color: '#FF5E5B' },
      { icon: PayPalIcon, href: 'https://paypal.me/tawmae', color: '#003087' },
      {
        icon: SpotifyIcon,
        href: 'https://open.spotify.com/user/ruw453b3m44bz9jpgjlv9tk6v?si=6e57242b3f464c57',
        color: '#1DB954',
      },
    ],
  },
  {
    name: 'Pwnyy',
    logo: 'https://github.com/pwnyy.png',
    desc: 'I cant count the number of times ive been in a bind and pwnyy was immediately available in the official sb discord #general. Theres several of my projects that weather he knows it or not, would not exist without him.',
    socials: [
      { icon: ICO_GLOBE, href: 'https://doras.to/pwnyy', color: '#3b82f6' },
      { icon: DiscordIcon, href: 'https://discord.com/invite/XFNRDmguzM', color: '#5865F2' },
      { icon: BlueSkyIcon, href: 'https://bsky.app/profile/pwnyy.tv', color: '#0085ff' },
      {
        icon: ICO_GITHUB,
        href: 'https://github.com/pwnyy/Streamer.bot_Imports/tree/main',
        color: '#6e5494',
      },
      { icon: ICO_COFFEE, href: 'https://ko-fi.com/pwnyy', color: '#FF5E5B' },
    ],
  },
  {
    name: 'GaelLevel',
    twitchHandle: 'gaellevel',
    logo: 'https://static-cdn.jtvnw.net/jtv_user_pictures/a14088a7-329d-45cb-8df3-e183cf25b11f-profile_image-70x70.png',
    desc: 'If you want to learn anything about asset/scene creation, Gael is the person to watch. He was the first creator that i really locked into and learned from. His tutorials are top-tier.',
    socials: [
      { icon: ICO_GLOBE, href: 'https://gaellevel.com', color: '#3b82f6' },
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/gaellevel', color: '#9146FF' },
      { icon: ICO_YOUTUBE, href: 'https://www.youtube.com/GaelLEVEL', color: '#FF0000' },
      { icon: XIcon, href: 'https://x.com/Level_Photo/photo', color: '#1DA1F2' },
      { icon: ICO_SHOPBAG, href: 'https://gaellevel.gumroad.com', color: '#ff90e8' },
    ],
  },
  {
    name: 'WebMage',
    twitchHandle: 'web_mage',
    logo: 'https://github.com/Web-Mage.png',
    desc: 'Weather pwnyy is around in #general or not, this awesome dude is lurking in the shadows. Ive enjoyed our conversations and want you to know that I am extremely appreciative of everything you have done for this community.',
    socials: [
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/web_mage', color: '#9146FF' },
      { icon: CodePenIcon, href: 'https://codepen.io/Web_Mage', color: '#AE63E4' },
    ],
  },
  {
    name: 'VRFlad',
    twitchHandle: 'vrflad',
    logo: 'https://static-cdn.jtvnw.net/jtv_user_pictures/06753b06-46ee-48e6-92fa-ad427e7eea2d-profile_image-70x70.png',
    desc: 'He doesnt output as much as he used to but if I diddnt add him here i would be leaving out a true pillar of the community.',
    socials: [
      { icon: ICO_GLOBE, href: 'https://vrflad.com', color: '#3b82f6' },
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/vrflad', color: '#9146FF' },
      { icon: ICO_YOUTUBE, href: 'https://www.youtube.com/@vrflad', color: '#FF0000' },
      { icon: XIcon, href: 'https://x.com/VRFlad', color: '#1DA1F2' },
      { icon: ICO_INSTAGRAM, href: 'https://www.instagram.com/VRFlad', color: '#E4405F' },
      { icon: CodePenIcon, href: 'https://codepen.io/vrflad', color: '#AE63E4' },
    ],
  },
  {
    name: 'GoWMan',
    twitchHandle: 'gowman',
    logo: 'https://static-cdn.jtvnw.net/jtv_user_pictures/dd70b1ec-b906-416a-8a56-d067bda64514-profile_image-70x70.png',
    desc: 'You might not see him in the discord near as much as some of these other folks, but hes an alien and who tf doesnt love aliens? I also enjoy hanging out in his streams ;)',
    socials: [
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/gowman', color: '#9146FF' },
      {
        icon: ICO_YOUTUBE,
        href: 'https://www.youtube.com/channel/UCaJX1z9GD7Dz3HnNlkeNJWQ',
        color: '#FF0000',
      },
      { icon: XIcon, href: 'https://x.com/GoWMan_', color: '#1DA1F2' },
      { icon: TikTokIcon, href: 'https://www.tiktok.com/@gowman_', color: '#ff0050' },
      {
        icon: BlueSkyIcon,
        href: 'https://bsky.app/profile/alienwaifu.com',
        color: '#0085ff',
      },
      { icon: DiscordIcon, href: 'https://discord.com/invite/84aFtrGrWe', color: '#5865F2' },
      { icon: CodePenIcon, href: 'https://codepen.io/gowmantv', color: '#AE63E4' },
    ],
  },
  {
    name: 'MustachedManiac',
    twitchHandle: 'mustached_maniac',
    logo: 'https://github.com/Mustached-Maniac.png',
    desc: 'Real legend to allot of content creators for his spotify and ai chat plugins. The basis for my 1st 2nd 3rd project is due to him and his youtube tutorials.',
    socials: [
      { icon: ICO_GLOBE, href: 'https://mustachedmaniac.com/socials', color: '#3b82f6' },
      {
        icon: ICO_TWITCH,
        href: 'https://www.twitch.tv/mustached_maniac',
        color: '#9146FF',
      },
      {
        icon: ICO_YOUTUBE,
        href: 'https://www.youtube.com/@mustached_maniac',
        color: '#FF0000',
      },
      { icon: XIcon, href: 'https://x.com/MustachedMan1ac', color: '#1DA1F2' },
      { icon: DiscordIcon, href: 'https://discord.com/invite/n4k7vW7vRC', color: '#5865F2' },
      {
        icon: ICO_COFFEE,
        href: 'https://ko-fi.com/mustached_maniac/tip',
        color: '#FF5E5B',
      },
    ],
  },
  {
    name: 'Nutty',
    twitchHandle: 'nutty',
    logo: 'https://github.com/nuttylmao.png',
    desc: 'If you need help with move, or any other obs plugin, this is probably your guy. Ive used plenty of his projects and is probably the most well known of any of these guys. His youtube videos are super high quality.',
    socials: [
      { icon: ICO_GLOBE, href: 'https://nutty.gg', color: '#3b82f6' },
      { icon: ICO_TWITCH, href: 'https://twitch.tv/nutty', color: '#9146FF' },
      {
        icon: ICO_YOUTUBE,
        href: 'https://youtube.com/channel/UCI5t_ve3cr5a1_3rrmbp6jQ',
        color: '#FF0000',
      },
      { icon: XIcon, href: 'https://x.com/nuttylmao', color: '#1DA1F2' },
      { icon: DiscordIcon, href: 'https://discordapp.com/invite/V4rvjrb', color: '#5865F2' },
      { icon: ICO_GITHUB, href: 'https://github.com/nuttylmao', color: '#6e5494' },
      { icon: PatreonIcon, href: 'https://patreon.com/nuttylmao', color: '#FF424D' },
    ],
  },
  {
    name: 'StreamUp',
    logo: 'https://github.com/StreamUPTips.png',
    desc: 'CodewithTD and Andi have teamed up with some other great creators to create a super team over there at stream up and is a great place for resources no longer how long you have been streaming.',
    socials: [
      { icon: ICO_GLOBE, href: 'https://streamup.tips', color: '#3b82f6' },
      { icon: ICO_GITHUB, href: 'https://github.com/StreamUPTips', color: '#6e5494' },
    ],
  },
  {
    name: 'DigiVybe',
    twitchHandle: 'digivybe',
    logo: 'https://github.com/digivybe.png',
    desc: 'I only recently met this guy but he has great vibes, and hes an up and comer in the sb space like me and oozes quality with everything he does. I highly suggest checking him out.',
    socials: [
      { icon: ICO_GLOBE, href: 'https://digivybe.xyz', color: '#3b82f6' },
      { icon: ICO_TWITCH, href: 'https://twitch.tv/digivybe', color: '#9146FF' },
      {
        icon: ICO_YOUTUBE,
        href: 'https://youtube.com/channel/UCEHU0kJbaevBhtTe5GphkXA',
        color: '#FF0000',
      },
      { icon: XIcon, href: 'https://x.com/DigiVybe', color: '#1DA1F2' },
      { icon: ICO_INSTAGRAM, href: 'https://instagram.com/DigiVybe', color: '#E4405F' },
      { icon: ThreadsIcon, href: 'https://threads.net/@DigiVybe', color: '#C13584' },
      { icon: TikTokIcon, href: 'https://www.tiktok.com/@digivybe', color: '#ff0050' },
      {
        icon: BlueSkyIcon,
        href: 'https://bsky.app/profile/digivybe.bsky.social',
        color: '#0085ff',
      },
    ],
  },
  {
    name: 'Andilippi',
    twitchHandle: 'andilippi',
    logo: 'https://static-cdn.jtvnw.net/jtv_user_pictures/c12eceed-4ba5-49f3-86bd-9641678fb6b0-profile_image-70x70.png',
    desc: 'Andi is a truly goated member of the obs and streamerbot community. His youtube content covers all of the stuff that him and the rest of the StreamUp guys create and also any other incredible obs plugins that come out in the community. Super fun guy and without him, so many streams wouldnt look near as good as they do!',
    socials: [
      { icon: ICO_GLOBE, href: 'https://doras.to/andi', color: '#3b82f6' },
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/andilippi', color: '#9146FF' },
      { icon: XIcon, href: 'https://x.com/andi_stone', color: '#1DA1F2' },
      {
        icon: ICO_INSTAGRAM,
        href: 'https://www.instagram.com/andistonemedia',
        color: '#E4405F',
      },
      {
        icon: BlueSkyIcon,
        href: 'https://bsky.app/profile/andistonemedia.bsky.social',
        color: '#0085ff',
      },
      {
        icon: ThreadsIcon,
        href: 'https://www.threads.com/@andistonemedia',
        color: '#C13584',
      },
      { icon: DiscordIcon, href: 'https://discord.com/invite/cACrArM7jT', color: '#5865F2' },
    ],
  },
  {
    name: 'CodeWithTD',
    twitchHandle: 'codewithtd',
    logo: 'https://static-cdn.jtvnw.net/jtv_user_pictures/4441aea3-94c5-48d5-aa9b-52e4c3d37e9b-profile_image-70x70.jpeg',
    desc: 'I look forward to the day that this guy starts streaming on a regular basis again. Ive only heard rumors of the commitment that this guy contributed to the SB community in its earlier days. Most likely, if you are using anything created by anyone, it wouldnt exist in its current capacity without the things that he has done.',
    socials: [
      { icon: ICO_GLOBE, href: 'https://doras.to/td', color: '#3b82f6' },
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/codewithtd', color: '#9146FF' },
      {
        icon: ICO_YOUTUBE,
        href: 'https://www.youtube.com/@terrierdarts',
        color: '#FF0000',
      },
      { icon: KickIcon, href: 'https://kick.com/codewithtd', color: '#53FC18' },
      { icon: ICO_GLOBE, href: 'https://terrierdarts.co.uk/en/home/', color: '#3b82f6' },
      { icon: XIcon, href: 'https://x.com/terrierdarts', color: '#1DA1F2' },
      {
        icon: BlueSkyIcon,
        href: 'https://bsky.app/profile/terrierdarts.co.uk',
        color: '#0085ff',
      },
    ],
  },
  {
    name: 'OsuPhoenix',
    twitchHandle: 'osuphoenix',
    logo: 'https://static-cdn.jtvnw.net/jtv_user_pictures/2a814e73-2250-453d-9379-41e9fe175893-profile_image-70x70.png',
    desc: 'Incredible streamer and content creator. He has made a ton of tutorials for some higher level stuff including using blender to create custom 3d alerts and overlays. An extremely genuine person who diserves all the support!',
    socials: [
      { icon: ICO_GLOBE, href: 'https://osuphoenix.tv', color: '#3b82f6' },
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/osuphoenix', color: '#9146FF' },
      {
        icon: ICO_YOUTUBE,
        href: 'https://www.youtube.com/channel/UCo1TRXk-Swpk1UkKOzkSdPQ',
        color: '#FF0000',
      },
      { icon: XIcon, href: 'https://x.com/OSUPhoenix13', color: '#1DA1F2' },
      {
        icon: ICO_INSTAGRAM,
        href: 'https://www.instagram.com/osuphoenix13/',
        color: '#E4405F',
      },
      {
        icon: TikTokIcon,
        href: 'https://www.tiktok.com/@osuphoenix?lang=en',
        color: '#ff0050',
      },
      {
        icon: FacebookIcon,
        href: 'https://www.facebook.com/OSUPhoenix',
        color: '#1877F2',
      },
      { icon: DiscordIcon, href: 'https://discord.com/invite/TGPwXM7Kfv', color: '#5865F2' },
    ],
  },
];

const COMMUNITY: PersonData[] = [
  {
    name: 'TattedTizzy',
    twitchHandle: 'tattedtizzy',
    logo: 'https://static-cdn.jtvnw.net/jtv_user_pictures/fe125636-01e9-4d7e-a088-f4354f0d7ab6-profile_image-70x70.png',
    desc: 'Incredibly entertaining streamer, a great friend and secretly my boyfriend...',
    socials: [
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/tattedtizzy', color: '#9146FF' },
      { icon: ICO_YOUTUBE, href: 'https://www.youtube.com/@TattedTizzy', color: '#FF0000' },
      {
        icon: TikTokIcon,
        href: 'https://www.tiktok.com/@tattedtizzy?lang=en',
        color: '#ff0050',
      },
      {
        icon: ICO_INSTAGRAM,
        href: 'https://www.instagram.com/tattedtizzy/',
        color: '#E4405F',
      },
      { icon: XIcon, href: 'https://twitter.com/TattedTizzy', color: '#1DA1F2' },
      { icon: DiscordIcon, href: 'https://discord.gg/JE3K6tR5EZ', color: '#5865F2' },
      { icon: ICO_GIFT, href: 'https://throne.com/tattedtizzy', color: '#FF3F5F' },
      { icon: ICO_COFFEE, href: 'https://ko-fi.com/tattedtizzy', color: '#FF5E5B' },
    ],
  },
  {
    name: 'OkV1sual',
    twitchHandle: 'okv1sual',
    logo: 'https://static-cdn.jtvnw.net/jtv_user_pictures/e666e029-4976-4baf-a7c1-3a29b7e63468-profile_image-70x70.png',
    desc: 'My homie, my number one most collabed with streamer in 2025, an amazing artist and a wonderful friend.',
    socials: [
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/okv1sual', color: '#9146FF' },
      {
        icon: ICO_SHOPBAG,
        href: 'https://vis-npk-shop.fourthwall.com/',
        color: '#3b82f6',
      },
      {
        icon: ICO_YOUTUBE,
        href: 'https://www.youtube.com/channel/UCkWw7bnOcXBdNgEKknbwmfg',
        color: '#FF0000',
      },
      { icon: XIcon, href: 'https://x.com/ok_v1sual', color: '#1DA1F2' },
      { icon: DiscordIcon, href: 'https://discord.gg/a5jkpbShfB', color: '#5865F2' },
      {
        icon: ICO_COFFEE,
        href: 'https://streamelements.com/okv1sual/tip',
        color: '#FF5E5B',
      },
    ],
  },
  {
    name: 'Archurro_27',
    twitchHandle: 'archurro_27',
    logo: 'https://static-cdn.jtvnw.net/jtv_user_pictures/7c76becf-61c4-4147-a04d-dea0f6368e77-profile_image-70x70.png',
    desc: 'Absolutely great dude and one of the most genuine people that I know with an incredible community.',
    socials: [
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/archurro_27', color: '#9146FF' },
      { icon: ICO_YOUTUBE, href: 'https://www.youtube.com/@archurro9403', color: '#FF0000' },
      {
        icon: ICO_INSTAGRAM,
        href: 'https://www.instagram.com/archurro27/',
        color: '#E4405F',
      },
      { icon: XIcon, href: 'https://twitter.com/Churro_A69', color: '#1DA1F2' },
      { icon: DiscordIcon, href: 'https://discord.gg/FDVu8JBe', color: '#5865F2' },
    ],
  },
  {
    name: 'LeftClickSnipe',
    twitchHandle: 'leftclicksnipe',
    logo: 'https://static-cdn.jtvnw.net/jtv_user_pictures/b984141b-9b35-48e3-b663-97384f44fce6-profile_image-70x70.png',
    desc: 'This will forever be an absolute homie of mine. Much love to you left, for everything.',
    socials: [
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/leftclicksnipe', color: '#9146FF' },
      { icon: ICO_INSTAGRAM, href: 'https://instagram.com/leftclicksnipe', color: '#E4405F' },
      { icon: TikTokIcon, href: 'https://tiktok.com/@leftclicksnipe', color: '#ff0050' },
      {
        icon: ICO_YOUTUBE,
        href: 'https://www.youtube.com/channel/UC5Cov8XjjXhbgWQbS3fZTxg',
        color: '#FF0000',
      },
      { icon: DiscordIcon, href: 'https://discord.gg/sKcrhVaCh2', color: '#5865F2' },
    ],
  },
  {
    name: 'MiltyTheGreat',
    twitchHandle: 'miltythegreat',
    logo: 'https://static-cdn.jtvnw.net/jtv_user_pictures/miltythegreat-profile_image-f768d57917f81863-70x70.png',
    desc: 'This man is incredibly knowledgable about streaming, tech, and so much more. In case you were wondering, milty was right. Also my supposed evil twin.',
    socials: [
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/miltythegreat', color: '#9146FF' },
      {
        icon: ICO_YOUTUBE,
        href: 'https://www.youtube.com/@Milty_The_Great',
        color: '#FF0000',
      },
      {
        icon: TikTokIcon,
        href: 'https://www.tiktok.com/@miltythegreat',
        color: '#ff0050',
      },
      { icon: XIcon, href: 'https://twitter.com/MiltyTheGreat', color: '#1DA1F2' },
      { icon: DiscordIcon, href: 'https://discord.gg/2Hh3CZvVTh', color: '#5865F2' },
    ],
  },
  {
    name: 'ImColeyMoley',
    twitchHandle: 'imcoleymoley',
    logo: 'https://static-cdn.jtvnw.net/jtv_user_pictures/be0c8034-5a0d-4251-a87f-428481188b6e-profile_image-70x70.png',
    desc: 'I might have spent more time in this mans stream than anyone else recently. Incredibly chill streams and usually laughs at my absolutely unhinged jokes. I cant wait for my relationship with him to continue to develop.',
    socials: [
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/imcoleymoley', color: '#9146FF' },
      {
        icon: ICO_YOUTUBE,
        href: 'https://www.youtube.com/@ItsColeyMoley88',
        color: '#FF0000',
      },
      { icon: DiscordIcon, href: 'https://discord.gg/Vd6sK3s', color: '#5865F2' },
    ],
  },
  {
    name: 'YoThatsCarter',
    twitchHandle: 'yothatscarter',
    logo: 'https://static-cdn.jtvnw.net/jtv_user_pictures/6ee8b67e-bccf-4362-a131-61b8ec60f316-profile_image-70x70.png',
    desc: 'Dope ass dude. Super high quality content and fun to talk to. If your looking for a chill community to hang out in, this guy is beyond worth checking out!',
    socials: [
      { icon: ICO_TWITCH, href: 'https://www.twitch.tv/yothatscarter', color: '#9146FF' },
      {
        icon: ICO_YOUTUBE,
        href: 'https://www.youtube.com/@yothatscarter',
        color: '#FF0000',
      },
      { icon: TikTokIcon, href: 'https://www.tiktok.com/@yothatscarter', color: '#ff0050' },
      { icon: XIcon, href: 'https://x.com/yothatscarter', color: '#1DA1F2' },
      {
        icon: ICO_INSTAGRAM,
        href: 'https://www.instagram.com/yothatscarter',
        color: '#E4405F',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function sortByLive(list: PersonData[], liveHandles: Set<string>): PersonData[] {
  return [...list].sort((a, b) => {
    const aLive = a.twitchHandle && liveHandles.has(a.twitchHandle) ? 1 : 0;
    const bLive = b.twitchHandle && liveHandles.has(b.twitchHandle) ? 1 : 0;
    return bLive - aLive;
  });
}

export function Support() {
  const [liveHandles, setLiveHandles] = useState<Set<string>>(() => {
    try {
      const cached = sessionStorage.getItem('melt-live-handles');
      return cached ? new Set(JSON.parse(cached)) : new Set();
    } catch {
      return new Set();
    }
  });

  const handleLiveChange = useCallback((handle: string, live: boolean) => {
    setLiveHandles((prev) => {
      const next = new Set(prev);
      if (live) next.add(handle);
      else next.delete(handle);
      try {
        sessionStorage.setItem('melt-live-handles', JSON.stringify([...next]));
      } catch {
        // ignore storage errors (private mode, etc.)
      }
      return next;
    });
  }, []);

  const sortedInspirations = useMemo(
    () => sortByLive(INSPIRATIONS, liveHandles),
    [liveHandles],
  );
  const sortedCommunity = useMemo(
    () => sortByLive(COMMUNITY, liveHandles),
    [liveHandles],
  );

  return (
    <div className="flex flex-col gap-14 pb-20">
      {/* Manifesto */}
      <section className="flex w-full flex-col gap-6">
        <div className="flex items-center gap-3 px-2">
          <Activity size={18} className="text-melt-accent" />
          <h2 className="text-xs font-black tracking-[0.2em] uppercase text-melt-text-label">
            Manifesto
          </h2>
        </div>
        <div className="flex flex-col gap-8">
          <p className="whitespace-pre-wrap px-1 font-mono text-sm leading-relaxed text-melt-text-label">
            I create because I love to. I'm deeply passionate about my projects, and I strive to
            push the boundaries of quality in everything I release. At the end of the day, I do
            what I love to make people smile and seeing my ideas as tangible products is fun.
          </p>

          <div className="flex flex-col gap-4 border-l border-melt-text-muted/10 pl-4">
            <div className="flex items-center gap-3">
              <Brain size={14} className="text-melt-accent" />
              <h3 className="text-[10px] font-black tracking-[0.2em] uppercase text-melt-text-label">
                A.I. Disclosure
              </h3>
            </div>
            <p className="font-mono text-[11px] italic leading-relaxed text-melt-text-body opacity-40">
              Yes, I utilize AI in the creation of my projects. That does not mean I don't pour my
              absolute heart into them, or that I haven't lost months of sleep ensuring every
              release is as high-quality as possible. I work my ass off to see my dreams come
              true, and if my process isn't representitive of what you want to support, please
              look toward the incredible pillars of the streamerbot community, found in the
              Inspirations section below.
            </p>
          </div>
        </div>
      </section>

      {/* Links */}
      <section className="flex w-full flex-col gap-8">
        <div className="flex items-center gap-3 px-2">
          <List size={18} className="text-melt-accent" />
          <h2 className="text-xs font-black tracking-[0.2em] uppercase text-melt-text-label">
            Links
          </h2>
        </div>
        <div className="grid w-full grid-cols-1 gap-x-8 gap-y-4 xl:grid-cols-3">
          <SocialRow
            icon={ICO_COFFEE}
            label="Ko-fi"
            desc="Buy me a coffee."
            href="https://ko-fi.com/melty1000"
            color="#FF5E5B"
          />
          <SocialRow
            icon={DiscordIcon}
            label="Discord"
            desc="Join my community for help and updates."
            href="https://discord.gg/8EfuxXgVyT"
            color="#5865F2"
          />
          <SocialRow
            icon={ICO_TWITCH}
            label="Twitch"
            desc="Watch development and gaming live."
            href="https://www.twitch.tv/melty1000"
            color="#9146FF"
          />
          <SocialRow
            icon={ICO_YOUTUBE}
            label="YouTube"
            desc="I dont post on here enough."
            href="https://www.youtube.com/@melty_1000"
            color="#FF0000"
          />
          <SocialRow
            icon={ICO_GITHUB}
            label="GitHub"
            desc="View source code and other repositories."
            href="https://github.com/Melty1000"
            color="#6e5494"
          />
          <SocialRow
            icon={XIcon}
            label="X / Twitter"
            desc="Follow for the latest project news."
            href="https://x.com/Melty_1000"
            color="#1DA1F2"
          />
        </div>
      </section>

      {/* Support Others */}
      <section className="flex w-full flex-col gap-8 pt-4">
        <div className="flex items-center gap-3 px-2">
          <Users size={18} className="text-melt-accent" />
          <h2 className="text-xs font-black tracking-[0.2em] uppercase text-melt-text-label">
            Support Others
          </h2>
        </div>
        <div className="flex w-full flex-col gap-8 lg:flex-row lg:gap-0">
          <div className="flex-1 lg:pr-8">
            <AutoScrollStrip
              items={sortedInspirations}
              onLiveChange={handleLiveChange}
              liveHandles={liveHandles}
              title="Inspirations"
              icon={<Heart size={14} className="text-melt-accent" />}
              description="Figures that laid the foundation for the tools I build today."
            />
          </div>
          <div className="hidden h-auto w-[1px] shrink-0 self-stretch bg-melt-text-muted/10 lg:my-2 lg:block" />
          <div className="block h-[1px] w-full shrink-0 bg-melt-text-muted/10 lg:hidden" />
          <div className="flex-1 lg:pl-8">
            <AutoScrollStrip
              items={sortedCommunity}
              onLiveChange={handleLiveChange}
              liveHandles={liveHandles}
              title="My Little Community"
              icon={<MessageSquare size={14} className="text-melt-accent" />}
              description="These are some of my favorite people in the world."
            />
          </div>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AutoScrollStrip({
  items,
  onLiveChange,
  liveHandles,
  title,
  icon,
  description,
}: {
  items: PersonData[];
  onLiveChange: (handle: string, live: boolean) => void;
  liveHandles: Set<string>;
  title: string;
  icon: React.ReactNode;
  description: string;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const isFirst = useRef(true);

  useEffect(() => {
    if (isPaused || items.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % items.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [isPaused, items.length]);

  useEffect(() => {
    if (!cardRef.current) return;
    if (isFirst.current) {
      gsap.set(cardRef.current, { x: 0, opacity: 1 });
      isFirst.current = false;
      return;
    }
    gsap.fromTo(
      cardRef.current,
      { x: 40, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.45, ease: 'power2.out' },
    );
  }, [activeIdx]);

  const person = items[activeIdx];
  if (!person) return null;
  const liveItems = items.filter(
    (p) => p.twitchHandle && liveHandles.has(p.twitchHandle),
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-2 px-2">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-3">
            {icon}
            <h3 className="text-[10px] font-black tracking-[0.2em] uppercase text-melt-text-label">
              {title}
            </h3>
            {liveItems.length > 0 ? (
              <span className="animate-pulse text-[8px] font-black uppercase tracking-widest text-red-500">
                · {liveItems.length} LIVE
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 pl-4">
            {items.map((item, i) => {
              const isLive = item.twitchHandle && liveHandles.has(item.twitchHandle);
              return (
                <button
                  key={item.name}
                  onClick={() => setActiveIdx(i)}
                  className={clsx(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === activeIdx
                      ? isLive
                        ? 'w-4 bg-red-500'
                        : 'w-4 bg-melt-accent'
                      : isLive
                        ? 'w-1.5 animate-pulse bg-red-500/50'
                        : 'w-1.5 bg-melt-text-muted/20 hover:bg-melt-text-muted/40',
                  )}
                />
              );
            })}
          </div>
        </div>
        <p className="px-1 font-mono text-[11px] italic text-melt-text-muted">
          {description}
        </p>
      </div>

      <div
        className="relative w-full"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div ref={cardRef}>
          <InspirationRow key={person.name} {...person} onLiveChange={onLiveChange} />
        </div>
      </div>
    </div>
  );
}

function SocialRow({
  icon,
  label,
  desc,
  href,
  color,
}: {
  icon: SocialIcon;
  label: string;
  desc: string;
  href: string;
  color: string;
}) {
  return (
    <div className="group/row flex w-full items-center gap-4">
      <SocialLink icon={icon} label={label} href={href} color={color} maxWidth={180} />
      <div className="flex-1 border-b border-melt-text-muted/10 pb-2 transition-colors">
        <p className="font-mono text-[11px] leading-relaxed text-melt-text-label">{desc}</p>
      </div>
    </div>
  );
}

function InspirationRow({
  name,
  logo,
  desc,
  socials,
  twitchHandle,
  onLiveChange,
}: PersonData & { onLiveChange?: (handle: string, live: boolean) => void }) {
  const [isLive, setIsLive] = useState(() => {
    if (!twitchHandle) return false;
    try {
      const cached = sessionStorage.getItem('melt-live-handles');
      return cached ? JSON.parse(cached).includes(twitchHandle) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!twitchHandle) return;
    let cancelled = false;

    const checkLive = async () => {
      try {
        const resp = await fetch(
          `https://static-cdn.jtvnw.net/previews-ttv/live_user_${twitchHandle.toLowerCase()}-440x248.jpg?t=${Date.now()}`,
          { method: 'GET', cache: 'no-cache' },
        );
        if (cancelled) return;
        const live = resp.ok && !resp.url.includes('404_preview');
        setIsLive(live);
        onLiveChange?.(twitchHandle, live);
      } catch {
        if (cancelled) return;
        setIsLive(false);
        onLiveChange?.(twitchHandle, false);
      }
    };

    void checkLive();
    const interval = setInterval(() => void checkLive(), 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [twitchHandle, onLiveChange]);

  return (
    <div className="group/inspiration flex w-full flex-col gap-3">
      <div className="flex flex-row items-start gap-4">
        <a
          href={isLive && twitchHandle ? `https://www.twitch.tv/${twitchHandle}` : undefined}
          target={isLive ? '_blank' : undefined}
          rel={isLive ? 'noopener noreferrer' : undefined}
          className={clsx(
            'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
            isLive &&
              "before:absolute before:inset-[-3px] before:rounded-full before:border-2 before:border-red-500 before:animate-pulse z-10 cursor-pointer",
          )}
        >
          <div className="relative flex h-full w-full shrink-0 items-center justify-center overflow-hidden rounded-full border border-melt-text-muted/10 bg-melt-text-muted/5 shadow-[0_0_0_1px_rgba(255,255,255,0.01)] transition-all duration-500 group-hover/inspiration:border-melt-accent">
            {logo ? (
              <img
                src={logo}
                alt={name}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="text-[7px] font-black uppercase tracking-tighter opacity-10">
                HEX
              </div>
            )}
          </div>
          {isLive ? (
            <div className="absolute -right-1 -top-1 rounded-sm bg-red-500 px-1 py-0.5 text-[6px] font-black uppercase tracking-tighter text-melt-surface shadow-lg">
              LIVE
            </div>
          ) : null}
        </a>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <a
            href={isLive && twitchHandle ? `https://www.twitch.tv/${twitchHandle}` : undefined}
            target={isLive ? '_blank' : undefined}
            rel={isLive ? 'noopener noreferrer' : undefined}
            className={clsx(
              'text-[10px] font-black tracking-widest uppercase text-melt-text-label transition-colors duration-300 group-hover/inspiration:text-melt-accent',
              isLive && 'cursor-pointer',
            )}
          >
            {name}
          </a>
          <p className="font-mono text-[11px] leading-relaxed text-melt-text-label transition-opacity group-hover/inspiration:text-melt-text-body">
            {desc}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {socials.map((social, i) => (
          <InspirationSocialBtn
            key={i}
            icon={social.icon}
            href={social.href}
            brandColor={social.color}
          />
        ))}
      </div>
    </div>
  );
}

function InspirationSocialBtn({
  icon: Icon,
  href,
  brandColor,
}: {
  icon: SocialIcon;
  href: string;
  brandColor: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group/sbtn flex shrink-0 items-center justify-center border-b border-transparent p-2.5 transition-colors duration-200 hover:border-melt-accent"
    >
      <Icon
        width={14}
        height={14}
        className="opacity-40 transition-opacity duration-300 group-hover/inspiration:opacity-100"
        style={{ color: brandColor }}
      />
    </a>
  );
}
