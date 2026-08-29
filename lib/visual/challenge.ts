export const challengeAppTypes = ['commerce','editorial','health','finance','field-service','education','booking','analytics','community','portfolio'] as const;
export type ChallengeAppType = typeof challengeAppTypes[number];

const signatures: Record<ChallengeAppType,{direction:'essential'|'expressive'|'premium';layout:string;component:string;density:'compact'|'comfortable'}> = {
  commerce:{direction:'expressive',layout:'catalog-detail-cart',component:'product-card',density:'comfortable'},
  editorial:{direction:'premium',layout:'masthead-story-stream',component:'story-lead',density:'comfortable'},
  health:{direction:'essential',layout:'care-plan-timeline',component:'appointment-card',density:'comfortable'},
  finance:{direction:'premium',layout:'portfolio-ledger',component:'metric-table',density:'compact'},
  'field-service':{direction:'essential',layout:'map-work-orders',component:'work-order',density:'compact'},
  education:{direction:'expressive',layout:'course-progress',component:'lesson-card',density:'comfortable'},
  booking:{direction:'essential',layout:'availability-calendar',component:'time-slot',density:'compact'},
  analytics:{direction:'premium',layout:'metric-canvas',component:'chart-panel',density:'compact'},
  community:{direction:'expressive',layout:'conversation-feed',component:'thread-card',density:'comfortable'},
  portfolio:{direction:'premium',layout:'project-narrative',component:'case-study',density:'comfortable'},
};

export function createChallengeBrief(type: ChallengeAppType) {
  const signature = signatures[type];
  return {
    type,
    ...signature,
    tokens:{background:'#F7F7F5',surface:'#FFFFFF',ink:'#181A1F',muted:'#5C616C',accent:'#E36F2F',gold:'#B98E36',border:'#E5E5E2'},
    viewports:[375,430,834,1024,1366,1600],
    states:['empty','loading','error','success','partial','offline'],
    accessibility:['focus-visible','keyboard','labels','contrast','reduced-motion'],
  } as const;
}
