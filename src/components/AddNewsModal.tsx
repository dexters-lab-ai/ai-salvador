
import ReactModal from 'react-modal';
import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { toast } from 'react-toastify';
import Button from './buttons/Button';

const modalStyles: ReactModal.Styles = {
  overlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    zIndex: 12,
  },
  content: {
    top: '50%',
    left: '50%',
    right: 'auto',
    bottom: 'auto',
    marginRight: '-50%',
    transform: 'translate(-50%, -50%)',
    maxWidth: '560px',
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto',
    border: '10px solid rgb(23, 20, 33)',
    borderRadius: '0',
    background: 'rgb(35, 38, 58)',
    color: 'white',
    fontFamily: '"Upheaval Pro", "sans-serif"',
  },
};

export function AddNewsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [source, setSource] = useState('');
  const [headline, setHeadline] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const addNewsArticle = useMutation(api.news.addNewsArticle);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!source || !headline || !content) {
      toast.error('Source, headline, and content are required.');
      return;
    }
    setIsSubmitting(true);
    try {
      await addNewsArticle({ source, headline, content, imageUrl: imageUrl || undefined });
      toast.success('News article added!');
      onClose();
      // Reset form
      setSource('');
      setHeadline('');
      setContent('');
      setImageUrl('');
    } catch (error) {
      toast.error('Failed to add news article.');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputStyles = "w-full p-2 bg-brown-900 border-2 border-brown-700 text-white font-body focus:outline-none focus:border-yellow-300";
  const labelStyles = "block text-left text-sm font-bold mb-1 text-white/80";

  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onClose}
      style={modalStyles}
      contentLabel="Add News Article"
      ariaHideApp={false}
    >
      <div className="font-body p-4">
        <h1 className="text-center text-4xl font-bold font-display game-title">Add News Article</h1>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="source" className={labelStyles}>Source</label>
            <input id="source" type="text" value={source} onChange={(e) => setSource(e.target.value)} className={inputStyles} placeholder="e.g. Tico Times" required />
          </div>
          <div>
            <label htmlFor="headline" className={labelStyles}>Headline</label>
            <input id="headline" type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} className={inputStyles} placeholder="e.g. Bitcoin Surge Creates Gains" required />
          </div>
          <div>
            <label htmlFor="content" className={labelStyles}>Content</label>
            <textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} className={`${inputStyles} h-24`} placeholder="Article content..." required />
          </div>
          <div>
            <label htmlFor="imageUrl" className={labelStyles}>Image URL (Optional)</label>
            <input id="imageUrl" type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className={inputStyles} placeholder="https://example.com/image.png" />
          </div>
          <div className="flex justify-end pt-4">
             <Button onClick={handleSubmit} className={isSubmitting ? 'opacity-50' : ''}>
              {isSubmitting ? 'Submitting...' : 'Submit Article'}
            </Button>
          </div>
        </form>
      </div>
    </ReactModal>
  );
}
