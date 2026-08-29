import { Helmet } from 'react-helmet-async';

interface SEOProps {
  title: string;
  description?: string;
  name?: string;
  type?: string;
  keywords?: string;
}

export default function SEO({ title, description, name, type, keywords }: SEOProps) {
  const defaultDesc = "Medihour provides top-tier educational content, specializing in medical admission preparation, HSC, and GST in Bangladesh.";
  const defaultKeywords = "medical, admission, bangladesh, hsc, gst, DMC, education, online courses, medihour";
  
  return (
    <Helmet>
      <title>{title} | Medihour</title>
      <meta name='description' content={description || defaultDesc} />
      <meta name='keywords' content={keywords || defaultKeywords} />
      
      <meta property="og:type" content={type || "website"} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description || defaultDesc} />
      
      <meta name="twitter:creator" content={name || "Medihour"} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description || defaultDesc} />
    </Helmet>
  );
}
