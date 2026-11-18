/** Design name is an alias; the live owned skin ID must remain unchanged. */
export const prometheus={
  ownedSkinId:'s1_red_crimson_core',designId:'s1_red_prometheus_flame',
  names:{vi:'Lửa thiêng Prometheus',en:'Divine Flame Prometheus'},
  colors:[0xf8fafc,0xe11d48,0x10b981,0xfacc15,0xf97316,0x2563eb],
  faceFlames:[
    {core:0xffffff,mid:0xe2e8f0,outer:0x94a3b8,high:0xf8fafc,vein:0xe2e8f0},
    {core:0xfff1f2,mid:0xff2a55,outer:0xe11d48,high:0xffe4e6,vein:0xff2a55},
    {core:0xecfdf5,mid:0x34d399,outer:0x10b981,high:0xd1fae5,vein:0x34d399},
    {core:0xfefce8,mid:0xfde047,outer:0xf59e0b,high:0xfef9c3,vein:0xfde047},
    {core:0xfff7ed,mid:0xfb923c,outer:0xf97316,high:0xffedd5,vein:0xfb923c},
    {core:0xeff6ff,mid:0x60a5fa,outer:0x2563eb,high:0xdbeafe,vein:0x60a5fa}
  ],
  geometry:{nominalCubeMm:55,pieceGapMm:.42,cornerRadius:.14,domeElevation:.035,channelDepthMm:.28,antiBleedRimMm:.32},
  fixedAppearance:{edgeRound:.38,centerRound:.26,roughness:.06,glow:.25},
  bronze:{color:0xc8963e,metalness:.88,roughness:.24},
  core:{inner:0xfff3b0,middle:0xffb703,outer:0xff2a55},
  turn:{duration:320,widthScale:1.08,sparks:14,life:[240,480],velocity:1.85,buoyancy:.65,drag:.92,flashMs:120},
  solve:{duration:3600,ignitionEnd:250,waveStart:650,waveEnd:2100,radius:3.2,particles:64,angularVelocity:4.2,rise:1.4},
  audio:{cwRate:1.04,ccwRate:.96,detune:18,polyphony:6,tpsThreshold:4.5,
    offsets:{U:[0,.85,0],D:[0,-.85,0],F:[0,0,.85],B:[0,0,-.85],L:[-.85,0,0],R:[.85,0,0]}},
  // Latest scan restores the medallion, with a separate flame palette for each face.
  center:{minimal:false,flame:true},
  // RGB emissive masks need a custom shader; normal maps encode normals, not signed heights.
  assetTarget:{masterResolution:1024,fallbackResolution:512,previewResolution:256,workingRelief:'geometry_and_baked_maps'},
  // Release contract only. This local study does not write shop or season data.
  release:{season:'season_01',sources:['season_spin'],startsOn:'2026-11-18',lastDay:'2026-12-08',
    duplicateZn:10,legacyShop:false,exclusiveForever:true,milestone:30,
    bundledSound:'sound_prometheus_divine_s1',keepMilestone15Sound:'sound_maglev_quantum_s1',serverApplied:false}
} as const;
